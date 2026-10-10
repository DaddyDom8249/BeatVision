import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../../src/pages/SongPage.tsx', import.meta.url), 'utf8');
const start = source.indexOf('  async function submit(');
const end = source.indexOf('\n  if (projectLoading', start);
assert.ok(start >= 0 && end > start, 'Song submit handler must be present');
const handler = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture({ failSave = false, replacement = true } = {}) {
  const removed = [];
  const events = [];
  let payload;
  let error;
  let selectedAudio = replacement ? { name: 'new.mp3', type: 'audio/mpeg' } : null;
  const song = { id: 'song-1', audio_path: 'user-1/project-1/old.mp3' };
  const query = { eq() { return this; }, select() { return this; }, async single() { events.push('db-save'); return { data: failSave ? null : { id: song.id }, error: failSave ? { message: 'database save failed' } : null }; } };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    storage: { from(bucket) { assert.equal(bucket, 'songs'); return { async upload() { events.push('upload'); return {}; }, async remove(paths) { removed.push(...paths); events.push('remove'); return {}; } }; } },
    from(table) { assert.equal(table, 'songs'); return { update(value) { payload = value; return query; } }; },
  };
  const submit = new Function('supabase', 'song', 'audio', 'project', 'projectId', 'crypto', 'saving', 'setSaving', 'setSaved', 'setError', 'setAudio', 'reload', 'title', 'artist', 'lyrics', 'creativeDirection', 'notes', handler + '\nreturn submit;')(
    client, song, selectedAudio, { owner_id: 'user-1' }, 'project-1', { randomUUID: () => 'new' }, false, () => {}, () => {}, value => { error = value; }, value => { selectedAudio = value; }, async () => { events.push('reload'); }, 'Song', 'Artist', '', '', ''
  );
  return { submit: () => submit({ preventDefault() {} }), state: () => ({ removed, events, payload, error, selectedAudio }) };
}

test('failed audio replacement preserves persisted audio and cleans only the new upload', async () => {
  const f = fixture({ failSave: true });
  await f.submit();
  const state = f.state();
  assert.deepEqual(state.removed, ['user-1/project-1/new.mp3']);
  assert.deepEqual(state.events, ['upload', 'db-save', 'remove']);
  assert.equal(state.error, 'database save failed');
  assert.ok(state.selectedAudio, 'failed save retains selection for retry');
});

test('successful audio replacement preserves audio referenced by locked creative snapshots', async () => {
  const f = fixture();
  await f.submit();
  const state = f.state();
  assert.deepEqual(state.removed, []);
  assert.equal(state.payload.audio_path, 'user-1/project-1/new.mp3');
  assert.equal(state.selectedAudio, null);
  assert.deepEqual(state.events, ['upload', 'db-save', 'reload']);
  assert.equal(state.error, null);
});

test('metadata save does not upload or remove audio or reset the audio path', async () => {
  const f = fixture({ replacement: false });
  await f.submit();
  const state = f.state();
  assert.deepEqual(state.removed, []);
  assert.equal('audio_path' in state.payload, false);
  assert.deepEqual(state.events, ['db-save', 'reload']);
});

test('failed metadata save never removes the current song audio', async () => {
  const f = fixture({ replacement: false, failSave: true });
  await f.submit();
  const state = f.state();
  assert.deepEqual(state.removed, []);
  assert.deepEqual(state.events, ['db-save']);
  assert.equal(state.error, 'database save failed');
});
