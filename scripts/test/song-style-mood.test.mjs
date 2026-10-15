import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import React, { act } from 'react';
import * as jsx from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';

function compile(path, dependencies, window) {
  const code = ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  runInNewContext(code, { module, exports: module.exports, window, crypto: globalThis.crypto,
    require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return jsx;
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return module.exports;
}

async function fixture(t, { existing = true, failSave = false, owner = true } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.test/projects/project-1/song' });
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const { createRoot } = await import('react-dom/client');
  const initial = {
    id: 'song-1', project_id: 'project-1', title: 'Fixture song', artist: 'Fixture artist',
    lyrics: 'A fixture lyric', style_mood: 'Noir, reflective', creative_direction: 'An intimate portrait',
    notes: 'Keep the existing notes', audio_path: null, audio_revision: '1', analysis_status: 'not_started', analysis: null,
  };
  let row = existing ? { ...initial } : null;
  let writes = 0;
  const selected = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) },
    storage: { from() { throw new Error('Text-only drafts must not access audio storage'); } },
    functions: { invoke() { throw new Error('Saving a draft must not invoke a provider'); } },
    from(table) {
      assert.equal(table, 'songs');
      let payload;
      return {
        select(columns) { selected.push(columns); this.columns = columns; return this; },
        eq() { return this; },
        update(value) { payload = value; return this; },
        insert(value) { payload = value; return this; },
        async maybeSingle() {
          return { data: row && Object.fromEntries(this.columns.split(',').map(key => [key, row[key]])), error: null };
        },
        async single() {
          writes++;
          if (failSave) return { data: null, error: { message: 'Fixture database save failed' } };
          row = { ...initial, ...row, ...payload };
          return { data: { id: row.id }, error: null };
        },
      };
    },
  };
  const { useSong } = compile('src/hooks/useSong.ts', { '../lib/supabase/client': { supabase } }, dom.window);
  const { default: Page } = compile('src/pages/SongPage.tsx', {
    '../lib/supabase/client': { supabase },
    '../hooks/useProject': { useProject: () => ({ project: { id: 'project-1', owner_id: owner ? 'owner' : 'other', title: 'Fixture project' }, loading: false }) },
    '../hooks/useSong': { useSong },
    '../lib/musicAnalysis': { analyzeAudioLocally() { throw new Error('No audio analysis expected'); } },
    '../lib/errorDetails': { formatFailure: () => 'Fixture failure' },
    '../components/navigation/StudioHeader': { default: () => null },
  }, dom.window);
  const root = createRoot(dom.window.document.getElementById('root'));
  const render = async (key = 'initial') => act(async () => root.render(React.createElement(Page, { projectId: 'project-1', key })));
  await render();
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
  });
  const controls = () => [...dom.window.document.querySelector('form').querySelectorAll('label')];
  const control = label => controls().find(node => node.firstChild.textContent.trim() === label)?.querySelector('input,textarea');
  return {
    document: dom.window.document, controls, control, selected, row: () => row, writes: () => writes,
    async edit(label, value) {
      const element = control(label);
      assert.ok(element, 'Missing control: ' + label);
      const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
      await act(async () => {
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      assert.equal(element.value, value);
    },
    async save() {
      await act(async () => dom.window.document.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    },
    reload: () => render('reload'),
  };
}

test('intake follows the creator-requested order with optional song upload', async t => {
  const f = await fixture(t);
  assert.equal(f.document.querySelector('h1').textContent, 'EVERY SONG.');
  assert.deepEqual(f.controls().map(label => label.firstChild.textContent.trim()), [
    'Title', 'Artist', 'Song (optional)', 'Lyrics', 'Style / Mood', 'Creative Direction', 'Extra Notes',
  ]);
  assert.equal(f.control('Song (optional)').required, false);
  assert.equal(f.control('Style / Mood').value, 'Noir, reflective');
  assert.ok(f.selected.some(columns => columns.split(',').includes('style_mood')));
});

test('style/mood saves without audio, survives reload, and preserves other creative input', async t => {
  const f = await fixture(t);
  await f.edit('Style / Mood', '  Black-and-white realism\nHopeful ending  ');
  await f.save();
  assert.equal(f.row().style_mood, 'Black-and-white realism\nHopeful ending');
  assert.equal(f.row().creative_direction, 'An intimate portrait');
  assert.equal(f.row().notes, 'Keep the existing notes');
  assert.equal(f.row().audio_path, null);
  assert.equal(f.row().analysis_status, 'not_started');
  assert.doesNotMatch(f.document.body.textContent, /Click Analyze Music Signal/);
  await f.reload();
  assert.equal(f.control('Style / Mood').value, f.row().style_mood);
  await f.edit('Style / Mood', '   ');
  await f.save();
  assert.equal(f.row().style_mood, null, 'Creator can intentionally clear draft style/mood');
});

test('a new lyrics-and-style draft saves without any song upload', async t => {
  const f = await fixture(t, { existing: false });
  for (const [label, value] of [['Title', 'Text-only song'], ['Artist', 'Fixture artist'], ['Lyrics', 'New lyrics'], ['Style / Mood', 'Tattoo flash, resilient']]) {
    await f.edit(label, value);
  }
  await f.save();
  assert.equal(f.writes(), 1);
  assert.equal(f.row().title, 'Text-only song');
  assert.equal(f.row().lyrics, 'New lyrics');
  assert.equal(f.row().style_mood, 'Tattoo flash, resilient');
  assert.equal(f.row().audio_path, null);
});

test('failed save retains the editable style/mood draft and does not report success', async t => {
  const f = await fixture(t, { failSave: true });
  await f.edit('Style / Mood', 'New unsaved direction');
  await f.save();
  assert.equal(f.row().style_mood, 'Noir, reflective');
  assert.equal(f.control('Style / Mood').value, 'New unsaved direction');
  assert.match(f.document.querySelector('[role="alert"]').textContent, /Fixture database save failed/);
  assert.doesNotMatch(f.document.body.textContent, /details saved successfully/);
});

test('another account cannot save style/mood through the song form', async t => {
  const f = await fixture(t, { owner: false });
  await f.save();
  assert.equal(f.writes(), 0);
  assert.match(f.document.querySelector('[role="alert"]').textContent, /not available to the signed-in account/);
});

test('World input keeps bounded creator style/mood separate from measured analysis', () => {
  const source = readFileSync(new URL('../../supabase/functions/beatvision-world/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('    const source = {');
  const end = source.indexOf('\n\n    const system', start);
  assert.ok(start >= 0 && end > start);
  const build = new Function('song', 'analysis', 'project', 'cleanText', 'compactArray', 'lyrics', 'transcript', source.slice(start, end) + '\nreturn source;');
  const input = build({ title: 'Title', artist: 'Artist', style_mood: 'x'.repeat(1000), creative_direction: 'Keep direction', notes: 'Keep notes' },
    { duration_seconds: 60, mood_tags: ['Measured mood'] }, { title: 'Project' },
    (value, max) => String(value ?? '').replace(/\u0000/g, '').slice(0, max),
    (value, max) => Array.isArray(value) ? value.slice(0, max) : [], 'Lyrics', 'Transcript');
  assert.equal(input.style_mood.length, 500);
  assert.equal(input.creative_direction, 'Keep direction');
  assert.deepEqual(input.musical_analysis.mood_tags, ['Measured mood']);
  assert.match(source, /select\("id,title,artist,lyrics,style_mood,creative_direction/);
  assert.match(source, /creator's style\/mood is artistic intent, not measured musical analysis/);
  assert.match(source, /const freeAccountVerified = false/);
});
