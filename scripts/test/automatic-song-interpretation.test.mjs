import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://fixture.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');

const draft = {
  id: 'draft-1', version: 1, status: 'draft', source_type: 'ai',
  interpretation: { summary: 'A journey toward home.', themes: ['return'], emotional_arc: 'Uncertainty becomes hope.',
    visual_motifs: ['Suggested motif: a path at sunrise.'], narrative: 'Suggested story: a traveler returns.',
    claims: [{ text: 'The transcript describes returning home.', evidence_refs: ['lyrics.transcript'] }] },
  evidence: [{ id: 'lyrics.transcript', kind: 'lyrics', reference: 'analysis.transcript', excerpt: 'I find my way home.' }],
};

async function mount({ existing = null, proposalError = false, transcriptionError = false, historyPending = false } = {}) {
  const calls = [];
  const song = { id: 'song', project_id: 'project', title: 'Fixture', artist: 'QA', lyrics: '', notes: '',
    audio_path: 'fixture.wav', audio_url: 'https://fixture.test/audio.wav', audio_revision: 'revision-1',
    analysis_status: 'pending', current_interpretation_id: existing?.status === 'confirmed' ? existing.id : null };
  let history = existing ? [existing] : [];
  let releaseHistory;
  const supabase = {
    async rpc(name, args) { calls.push({ name, ...args }); return { data: null, error: null }; },
    functions: { async invoke(name, { body }) {
      calls.push({ name, ...body });
      if (name === 'beatvision-analyze-song') {
        if (transcriptionError) return { data: null, error: new Error('Transcription unavailable') };
        song.analysis_status = 'completed';
        song.analysis = { duration_seconds: 16, transcript: 'I find my way home.', transcription_status: 'completed' };
        return { data: { status: 'completed', analysis: song.analysis }, error: null };
      }
      if (body.action === 'get') {
        if (historyPending) await new Promise(resolve => { releaseHistory = resolve; });
        return { data: { drafts: history }, error: null };
      }
      if (body.action === 'propose') {
        if (proposalError) {
          const error = new Error('Edge Function returned a non-2xx status code');
          error.context = new Response(JSON.stringify({ error: { code: 'AI_QUOTA_OR_CONCURRENCY_BLOCKED', message: 'Daily AI limit reached.' } }), { status: 429 });
          return { data: null, error };
        }
        history = [draft];
        return { data: { draft }, error: null };
      }
      throw new Error('Unexpected mutation: ' + body.action);
    } },
  };
  function compile(path) {
    const mod = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    runInNewContext(code, { module: mod, exports: mod.exports, Response, require(name) {
      if (name === 'react') return React;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (name === '../hooks/useProject') return { useProject: () => ({ project: { id: 'project', title: 'Fixture' }, loading: false }) };
      if (name === '../hooks/useSong') return { useSong: () => ({ song, loading: false, schemaReady: true, reload: async () => { calls.push({ name: 'reload' }); } }) };
      if (name === '../hooks/useSongInterpretation') return compile('src/hooks/useSongInterpretation.ts');
      if (name === '../components/song/SongInterpretationPanel') return compile('src/components/song/SongInterpretationPanel.tsx');
      if (name === '../lib/supabase/client') return { supabase };
      if (name === '../lib/musicAnalysis') return { analyzeAudioLocally: async () => ({ duration_seconds: 16, bpm: 117.5 }) };
      if (name === '../lib/errorDetails') return { formatFailure: (label, error) => label + ': ' + error.message };
      if (name.startsWith('../components/') || name.startsWith('./')) return { default: () => null };
      throw new Error('Unexpected dependency ' + name);
    } });
    return mod.exports;
  }
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await React.act(async () => { root.render(React.createElement(compile('src/pages/SongPage.tsx').default, { projectId: 'project' })); });
  const button = text => [...container.querySelectorAll('button')].find(b => b.textContent === text);
  const fields = () => [...container.querySelectorAll('.song-intelligence-fields textarea')];
  return { calls, song, container, fields, button,
    analyze: async () => { const b = button('Analyze Music Signal') || button('Re-Analyze Music'); assert.ok(b); assert.equal(b.disabled, false); await React.act(async () => b.click()); },
    edit: async (index, value) => { await React.act(async () => {
      const input = fields()[index]; Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    }); },
    releaseHistory: async () => { await React.act(async () => releaseHistory()); },
    close: async () => { await React.act(async () => root.unmount()); container.remove(); },
  };
}

test('Analyze transcribes then automatically fills all six editable draft sections without approval', async () => {
  const f = await mount();
  try {
    await f.analyze();
    const actions = f.calls.filter(c => c.name.startsWith('beatvision-') && c.action !== 'get');
    assert.deepEqual(actions.map(c => c.name), ['beatvision-analyze-song', 'beatvision-song-interpretation']);
    assert.equal(actions[1].action, 'propose');
    assert.equal(actions[1].audioRevision, 'revision-1');
    assert.equal(actions[1].only_if_empty, true);
    assert.equal(f.fields().length, 6);
    assert.ok(f.fields().every(field => field.value.trim() && !field.disabled));
    assert.equal(f.fields()[5].value, 'The transcript describes returning home.');
    assert.equal(f.button('Confirm Interpretation').disabled, false);
    assert.equal(f.button('Continue to World Reveal →').disabled, true);
    assert.equal(f.calls.some(c => c.action === 'confirm'), false);
    await f.edit(0, 'My edited interpretation');
    assert.equal(f.button('Confirm Interpretation').disabled, true);
  } finally { await f.close(); }
});

test('analysis preserves saved drafts and unsaved edits, including text typed before any draft exists', async () => {
  for (const existing of [null, { ...draft, source_type: 'manual' }, { ...draft, status: 'confirmed' }]) {
    const f = await mount({ existing });
    try {
      await f.edit(0, 'Creator wording to keep');
      await f.analyze();
      assert.equal(f.fields()[0].value, 'Creator wording to keep');
      assert.equal(f.calls.filter(c => c.action === 'propose').length, 0);
      assert.equal(f.calls.some(c => c.action === 'confirm'), false);
    } finally { await f.close(); }
  }
});

test('proposal failure retains successful transcription and does not retry or report it as failed', async () => {
  const f = await mount({ proposalError: true });
  try {
    await f.analyze();
    assert.equal(f.calls.filter(c => c.action === 'propose').length, 1);
    assert.equal(f.song.analysis.transcription_status, 'completed');
    assert.equal(f.calls.some(c => c.p_analysis?.transcription_status === 'failed'), false);
    assert.match(f.container.textContent, /Daily AI limit reached/);
    assert.equal(f.button('Analyze Music Signal')?.disabled ?? f.button('Re-Analyze Music')?.disabled, false);
  } finally { await f.close(); }
});

test('analysis waits for interpretation history and does not spend inference after transcription failure', async () => {
  const loading = await mount({ historyPending: true });
  try {
    assert.equal(loading.button('Analyze Music Signal').disabled, true);
    await loading.releaseHistory();
    assert.equal(loading.button('Analyze Music Signal').disabled, false);
  } finally { await loading.close(); }
  const f = await mount({ transcriptionError: true });
  try { await f.analyze(); assert.equal(f.calls.filter(c => c.action === 'propose').length, 0); }
  finally { await f.close(); }
});
