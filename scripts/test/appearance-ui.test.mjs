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
async function storyboard(t, { theme = 'arcane', assets = [], motionAssets = [], sceneRows = scenes, currentMedia, error = null, invoke } = {}) {
  const f = await fixture(t), calls = [];
  let activeTheme = theme;
  const supabase = {
    from(name) {
      calls.push(['from', name]);
      const query = {};
      for (const method of ['select', 'eq']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
      query.order = async (...args) => { calls.push(['order', ...args]); return { data: name === 'motion_clip_assets' ? motionAssets : assets, error }; };
      return query;
    },
    functions: { invoke: async (name, options) => { calls.push(['invoke', name, options.body]); return invoke ? invoke(options.body) : { data: { image_url: 'https://fixture.test/private-image.png' }, error: null }; } },
  };
  const Board = f.compile('src/components/storyboard/ArcaneStoryboard.tsx', {
    '../../lib/supabase/client': { supabase },
    '../../theme/ThemeProvider': { useAppearance: () => ({ preference: { theme: activeTheme }, reducedMotion: true }) },
  }).default;
  const props = { projectId: 'project', planId: 'plan', scenes: sceneRows, currentMedia };
  await f.render(Board, props);
  return { ...f, calls, theme: async theme => { activeTheme = theme; await f.render(Board, props); } };
}

test('Classic storyboard adds no UI or application reads', async t => {
  const f = await storyboard(t, { theme: 'classic' });
  assert.equal(f.document.querySelector('section'), null);
  assert.equal(f.calls.length, 0);
});

test('a failed approved thumbnail cannot hide a separate real production candidate', async t => {
  const f = await storyboard(t, {
    assets: [{ id: 'saved', scene_id: 'scene-1', approved: true, status: 'approved', image_url: 'https://fixture.test/expired.png' }],
    currentMedia: { sceneId: 'scene-1', image: { url: 'https://fixture.test/candidate.png', status: 'completed' } },
  });
  await act(async () => f.document.querySelector('.arcane-storyboard-thumbnail img').dispatchEvent(new f.window.Event('error')));
  const preview = f.document.querySelector('.arcane-preview-screen img');
  assert.equal(preview?.src, 'https://fixture.test/candidate.png');
  await act(async () => preview.dispatchEvent(new f.window.Event('error')));
  assert.equal(f.document.querySelector('.arcane-preview-screen img'), null);
  assert.match(f.document.querySelector('.arcane-preview-state').textContent, /unavailable/i);
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

test('cinematic cards show duration, camera and visual direction for every supplied scene', async t => {
  const sceneRows = Array.from({ length: 11 }, (_, i) => ({ ...scenes[i % 2], id: `many-${i}`, scene_number: i + 1 }));
  const f = await storyboard(t, { sceneRows });
  const cards = f.document.querySelectorAll('.arcane-storyboard-scene');
  assert.equal(cards.length, 11);
  assert.match(cards[0].textContent, /12.34s/);
  assert.match(cards[0].textContent, /Wide/);
  assert.match(cards[0].textContent, /A real draft/);
  assert.equal(f.document.querySelector('video'), null);
});

test('scene keyboard navigation selects the last scene and Director uses native disclosure', async t => {
  const f = await storyboard(t);
  const first = f.document.querySelector('.arcane-storyboard-scene');
  first.focus();
  await act(async () => first.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true })));
  const cards = f.document.querySelectorAll('.arcane-storyboard-scene');
  assert.equal(cards[1].getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.activeElement, cards[1]);
  const director = f.document.querySelector('details.arcane-director-panel');
  assert.ok(director);
  assert.match(director.querySelector('summary').textContent, /Scene Director/);
  assert.match(director.textContent, /Approved direction/);
  assert.equal([...director.querySelectorAll('button')].some(n => n.textContent === 'Edit scene direction'), false);
});

test('saved motion uses read-only refresh, native controls and decoded duration without claiming coverage', async t => {
  const f = await storyboard(t, { motionAssets: [
    { id: 'clip', scene_id: 'scene-1', approved: true, status: 'approved', provider: 'huggingface-zerogpu', model: 'ltx', video_url: null },
  ], invoke: async body => ({ data: body.action === 'motion_url' ? { video_url: 'https://fixture.test/saved.mp4' } : {}, error: null }) });
  assert.equal(f.document.querySelector('video'), null);
  await f.click([...f.document.querySelectorAll('button')].find(n => n.textContent === 'Motion'));
  const video = f.document.querySelector('video');
  assert.ok(video);
  assert.equal(video.controls, true);
  assert.equal(video.autoplay, false);
  assert.equal(video.src, 'https://fixture.test/saved.mp4');
  Object.defineProperty(video, 'duration', { value: 1.9 });
  await act(async () => video.dispatchEvent(new f.window.Event('loadedmetadata')));
  assert.match(f.document.body.textContent, /1.90s/);
  assert.match(f.document.body.textContent, /10.44s.*uncovered/);
  assert.equal(f.calls.some(c => c[0] === 'invoke' && !['motion_url', 'image_url'].includes(c[2].action)), false);
  await f.click(f.document.querySelectorAll('.arcane-storyboard-scene')[1]);
  assert.equal(f.document.querySelector('video'), null, 'old scene media must disappear immediately');
});
