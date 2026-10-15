import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
function compile(path, dependencies, window) {
  const code = ts.transpileModule(read(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const mod = { exports: {} };
  runInNewContext(code, {
    module: mod, exports: mod.exports, window, document: window.document, HTMLInputElement: window.HTMLInputElement, URL, queueMicrotask,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return jsx;
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return mod.exports;
}
async function fixture(t) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test', runScripts: 'outside-only' });
  const { window } = dom;
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.eval(read('public/appearance-init.js'));
  const root = createRoot(window.document.getElementById('root'));
  t.after(async () => { await act(async () => root.unmount()); window.close(); Object.assign(globalThis, previous); });
  return { window, document: window.document,
    compile: (path, dependencies) => compile(path, dependencies, window),
    render: async (Component, props) => { await act(async () => root.render(React.createElement(Component, props))); },
    click: async node => { assert.ok(node); await act(async () => node.click()); },
  };
}

test('real appearance controls switch and revert without remounting an unsaved editor', async t => {
  const f = await fixture(t);
  const auth = {
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    updateUser() { throw new Error('Logged-out selection cannot write to an account'); },
  };
  const store = f.compile('src/theme/appearance.ts', {});
  const provider = f.compile('src/theme/ThemeProvider.tsx', {
    '../lib/supabase/client': { supabase: { auth } }, './appearance': store,
  });
  const Controls = f.compile('src/components/appearance/AppearanceControls.tsx', {
    '../../theme/ThemeProvider': provider,
  }).default;
  let mounts = 0;
  function Editor() {
    React.useEffect(() => { mounts++; }, []);
    return React.createElement('textarea', { defaultValue: 'Unsaved creative direction', 'aria-label': 'Draft' });
  }
  function Page() { return React.createElement(provider.ThemeProvider, null, React.createElement(Editor), React.createElement(Controls)); }
  await f.render(Page);
  const draft = f.document.querySelector('textarea');
  draft.value = 'Keep this exact unsubmitted draft';
  assert.equal(f.document.querySelector('input[value="classic"]').checked, true);
  await f.click(f.document.querySelector('input[value="arcane"]'));
  assert.equal(f.document.documentElement.dataset.theme, 'arcane');
  assert.equal(JSON.parse(f.window.localStorage.getItem('beatvision.appearance.v1')).theme, 'arcane');
  await f.click(f.document.querySelector('input[type="checkbox"]'));
  assert.equal(f.document.documentElement.dataset.motion, 'reduce');
  await f.click([...f.document.querySelectorAll('button')].find(node => node.textContent === 'Use system'));
  assert.equal(f.document.documentElement.dataset.motion, 'full');
  await f.click(f.document.querySelector('input[value="classic"]'));
  assert.equal(f.document.documentElement.dataset.theme, 'classic');
  assert.equal(f.document.querySelector('textarea'), draft);
  assert.equal(draft.value, 'Keep this exact unsubmitted draft');
  assert.equal(mounts, 1);
});

const scenes = [
  { id: 'scene-1', scene_number: 1, title: 'First scene', start_time: 0, end_time: 12.34, status: 'draft', camera_direction: 'Wide', visual_direction: 'A real draft', location: 'Forest' },
  { id: 'scene-2', scene_number: 2, title: 'Second scene', start_time: 12.34, end_time: 62.75, status: 'approved', camera_direction: 'Close', visual_direction: 'Approved direction', location: 'Studio' },
];
async function storyboard(t, { theme = 'arcane', assets = [], error = null, invoke } = {}) {
  const f = await fixture(t), calls = [];
  let activeTheme = theme;
  const query = {};
  for (const method of ['select', 'eq']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.order = async (...args) => { calls.push(['order', ...args]); return { data: assets, error }; };
  const supabase = {
    from(name) { calls.push(['from', name]); return query; },
    functions: { invoke: async (name, options) => { calls.push(['invoke', name, options.body]); return invoke ? invoke(options.body) : { data: { image_url: 'https://fixture.test/private-image.png' }, error: null }; } },
  };
  const Board = f.compile('src/components/storyboard/ArcaneStoryboard.tsx', {
    '../../lib/supabase/client': { supabase },
    '../../theme/ThemeProvider': { useAppearance: () => ({ preference: { theme: activeTheme }, reducedMotion: true }) },
  }).default;
  const props = { projectId: 'project', planId: 'plan', scenes };
  await f.render(Board, props);
  return { ...f, calls, theme: async theme => { activeTheme = theme; await f.render(Board, props); } };
}

test('Classic storyboard adds no UI or application reads', async t => {
  const f = await storyboard(t, { theme: 'classic' });
  assert.equal(f.document.querySelector('section'), null);
  assert.equal(f.calls.length, 0);
});

test('Arcane storyboard shows authoritative times and honest empty states, then focuses the original editor', async t => {
  const f = await storyboard(t);
  assert.match(f.document.body.textContent, /00:12.34 - 01:02.75/);
  assert.match(f.document.body.textContent, /No approved image/);
  assert.equal(f.document.querySelector('img'), null);
  const editor = f.document.createElement('article');
  editor.id = 'scene-director-scene-1'; editor.tabIndex = -1;
  let scrolled;
  editor.scrollIntoView = options => { scrolled = options; };
  f.document.body.appendChild(editor);
  await f.click([...f.document.querySelectorAll('button')].find(node => node.textContent === 'Edit scene direction'));
  assert.equal(f.document.activeElement, editor);
  assert.equal(scrolled.behavior, 'auto');
  const filters = f.calls.filter(call => call[0] === 'eq').map(call => call.slice(1));
  assert.deepEqual(filters, [['project_id', 'project'], ['visual_plan_id', 'plan'], ['approved', true], ['status', 'approved']]);
});

test('Arcane uses only approved saved imagery and read-only playback refreshes', async t => {
  const f = await storyboard(t, { assets: [
    { id: 'approved', scene_id: 'scene-1', approved: true, status: 'approved', storage_path: 'owned/path', image_url: null },
    { id: 'unapproved', scene_id: 'scene-2', approved: false, status: 'draft', image_url: 'https://fixture.test/unapproved.png' },
  ] });
  assert.ok(f.document.querySelector('img[src="https://fixture.test/private-image.png"]'));
  assert.equal(f.document.querySelector('img[src*="unapproved"]'), null);
  const invokes = f.calls.filter(call => call[0] === 'invoke');
  assert.deepEqual(JSON.parse(JSON.stringify(invokes)), [['invoke', 'beatvision-generation', { action: 'image_url', projectId: 'project', assetId: 'approved' }]]);
  await f.theme('classic');
  assert.equal(f.document.querySelector('section'), null);
});

test('saved preview failures report unavailable rather than generated success', async t => {
  const f = await storyboard(t, { error: new Error('read denied') });
  assert.match(f.document.querySelector('[role="alert"]').textContent, /unavailable/);
  assert.equal(f.document.querySelector('img'), null);
  assert.equal(f.calls.some(call => call[0] === 'invoke'), false);
});

test('a failed private image refresh does not hide other approved previews or claim missing approval', async t => {
  const f = await storyboard(t, { assets: [
    { id: 'failed', scene_id: 'scene-1', approved: true, status: 'approved', storage_path: 'owned/path', image_url: null },
    { id: 'saved', scene_id: 'scene-2', approved: true, status: 'approved', image_url: 'https://fixture.test/approved.png' },
  ], invoke: async () => ({ data: null, error: new Error('unavailable') }) });
  const cards = f.document.querySelectorAll('.arcane-storyboard-scene');
  assert.match(cards[0].textContent, /Preview unavailable/);
  assert.doesNotMatch(cards[0].textContent, /No approved image/);
  assert.ok(cards[1].querySelector('img[src="https://fixture.test/approved.png"]'));
});

test('startup bootstrap precedes React and branch previews are explicitly disabled', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('/appearance-init.js') < html.indexOf('/src/main.tsx'));
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.git.deploymentEnabled['feature/arcane-cinema-theme'], false);
});

test('appearance dialog wraps keyboard focus and returns it on close', async t => {
  const f = await fixture(t);
  f.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  f.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const Controls = () => React.createElement(React.Fragment, null,
    React.createElement('input', { type: 'radio', name: 'theme', defaultChecked: true }),
    React.createElement('input', { type: 'radio', name: 'theme' }),
    React.createElement('input', { type: 'checkbox', 'aria-label': 'Reduced motion' }));
  const Button = f.compile('src/components/appearance/AppearanceButton.tsx', { './AppearanceControls': { default: Controls } }).default;
  await f.render(Button);
  const trigger = f.document.querySelector('.appearance-trigger');
  await f.click(trigger);
  const close = f.document.querySelector('.appearance-close');
  const last = f.document.querySelector('input[type="checkbox"]');
  last.focus();
  await act(async () => last.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  assert.equal(f.document.activeElement, close);
  await act(async () => close.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  assert.equal(f.document.activeElement, last);
  await f.click(close);
  assert.equal(f.document.querySelector('dialog'), null);
  assert.equal(f.document.activeElement, trigger);
});

test('Arcane text, controls and statuses meet normal-text contrast against their surfaces', () => {
  const css = read('src/theme/arcane.css');
  const block = css.match(/:root\[data-theme='arcane'\] \{([^}]+)\}/)[1];
  const tokens = Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6});/g)].map(match => [match[1], match[2]]));
  const luminance = color => color.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255)
    .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  for (const [foreground, background] of [
    ['--text-main', '--bg-app'], ['--text-muted', '--bg-surface-1'], ['--text-dim', '--bg-surface-2'],
    ['--text-main', '--arcane-button'], ['--text-main', '--arcane-button-hover'],
    ['--arcane-cyan', '--bg-surface-2'], ['--arcane-gold', '--bg-surface-1'],
  ]) {
    const values = [luminance(tokens[foreground]), luminance(tokens[background])].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground} on ${background}`);
  }
});

test('narrow Arcane branding retains intrinsic width so header controls wrap instead of overlap', () => {
  const dom = new JSDOM('<style></style>');
  dom.window.document.querySelector('style').textContent = read('src/theme/arcane.css');
  const mobile = [...dom.window.document.styleSheets[0].cssRules].find(rule => rule.conditionText === '(max-width: 700px)');
  const brand = [...mobile.cssRules].find(rule => rule.selectorText === ":root[data-theme='arcane'] .studio-topbar-left");
  assert.equal(brand.style.getPropertyValue('min-width'), 'max-content');
  const actions = [...mobile.cssRules].find(rule => rule.selectorText === ":root[data-theme='arcane'] .studio-topbar-right");
  assert.equal(actions.style.getPropertyValue('max-width'), '100%');
  dom.window.close();
});
