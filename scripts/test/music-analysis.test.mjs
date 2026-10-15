import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { database, readMigration } from './pglite-runtime.mjs';

const source = readFileSync(new URL('../../src/lib/musicAnalysis.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function analyze({ sampleRate = 8000, sampleCount = 3064987, varying = false, decodeError = null } = {}) {
  const samples = new Float32Array(sampleCount);
  if (varying) {
    for (let i = 0; i < samples.length; i++) {
      const amplitude = Math.floor(i / Math.max(1, Math.floor(samples.length / 8))) % 2 ? 0.8 : 0.05;
      samples[i] = amplitude * Math.sin(2 * Math.PI * 220 * i / sampleRate);
    }
  }
  let closes = 0;
  const module = { exports: {} };
  runInNewContext(compiled, { module, exports: module.exports,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    AudioContext: class {
      async decodeAudioData() {
        if (decodeError) throw decodeError;
        return { duration: samples.length / sampleRate, sampleRate, numberOfChannels: 1, getChannelData: () => samples };
      }
      async close() { closes++; }
    },
  });
  try {
    const result = await module.exports.analyzeAudioLocally('https://fixture.test/song.m4a');
    assert.equal(closes, 1);
    return result;
  } catch (error) {
    assert.equal(closes, 1, 'Decode failure must still release the audio context');
    throw error;
  }
}

for (const fixture of [
  { sampleCount: 1 },
  { sampleCount: 2000 },
  { sampleCount: 4000 },
  { sampleCount: 10001, sampleRate: 44100 },
  { sampleCount: 96001, varying: true },
  { sampleCount: 3064987 },
]) {
  test('decoded audio has positive, contiguous sections through its exact duration: ' + JSON.stringify(fixture), async () => {
    const result = await analyze(fixture);
    assert.equal(result.sections[0].start_time, 0);
    assert.equal(result.sections.at(-1).end_time, result.duration_seconds);
    for (let i = 0; i < result.sections.length; i++) {
      const section = result.sections[i];
      assert.ok(Number.isFinite(section.start_time) && Number.isFinite(section.end_time));
      assert.ok(section.end_time > section.start_time, 'Section must have positive duration: ' + JSON.stringify(section));
      assert.ok(section.end_time <= result.duration_seconds);
      if (i) assert.equal(section.start_time, result.sections[i - 1].end_time);
    }
  });
}

test('the actual local analysis payload passes the unchanged owner-checked database RPC', async () => {
  const analysis = await analyze();
  const db = await database();
  const owner = '00000000-0000-4000-8000-000000000001';
  const project = '00000000-0000-4000-8000-000000000003';
  const song = '00000000-0000-4000-8000-000000000006';
  try {
    await db.exec(await readMigration('20261014021500_owner_checked_analysis_writes.sql'));
    await db.query('insert into projects(id,owner_id) values($1,$2)', [project, owner]);
    await db.query('insert into songs(id,project_id,audio_path) values($1,$2,$3)', [song, project, 'owner/project/fixture.m4a']);
    await db.exec(`set request.jwt.claim.sub='${owner}'; set role authenticated`);
    const save = value => db.query('select save_local_song_analysis($1,$2,$3,$4,$5)', [project, song, '1', 'completed', value]);
    await save(analysis);
    const row = (await db.query('select analysis_status,analysis from songs where id=$1', [song])).rows[0];
    assert.equal(row.analysis_status, 'completed');
    assert.equal(row.analysis.duration_seconds, analysis.duration_seconds);
    assert.deepEqual(row.analysis.sections, JSON.parse(JSON.stringify(analysis.sections)));
    await assert.rejects(save({ ...analysis, sections: [{ start_time: analysis.duration_seconds, end_time: analysis.duration_seconds }] }), /LOCAL_ANALYSIS_SECTIONS_INVALID/);
  } finally {
    await db.close();
  }
});

test('failed browser decode closes the audio context and reports the failure', async () => {
  await assert.rejects(analyze({ sampleCount: 1, decodeError: new Error('Fixture unsupported codec') }), /Fixture unsupported codec/);
});
