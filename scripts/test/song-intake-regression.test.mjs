import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const analysisSource = readFileSync(new URL('../../src/lib/musicAnalysis.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(analysisSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

test('local analysis emits only positive contiguous sections through exact duration', async () => {
  const samples = new Float32Array(3064987);
  const module = { exports: {} };
  runInNewContext(compiled, { module, exports: module.exports, fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }),
    AudioContext: class { async decodeAudioData() { return { duration: samples.length / 8000, sampleRate: 8000, numberOfChannels: 1, getChannelData: () => samples }; } async close() {} } });
  const result = await module.exports.analyzeAudioLocally('https://fixture.test/short.wav');
  assert.equal(result.sections[0].start_time, 0);
  assert.equal(result.sections.at(-1).end_time, result.duration_seconds);
  for (const section of result.sections) assert.ok(section.end_time > section.start_time, JSON.stringify(section));
});

test('song intake separates analysis state and protects unsaved creator fields on analysis refresh', () => {
  const source = readFileSync(new URL('../../src/pages/SongPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /const \[analyzing, setAnalyzing\] = useState\(false\)/);
  assert.match(source, /if \(saving \|\| analyzing/);
  assert.match(source, /setAnalyzing\(true\)/);
  assert.match(source, /setAnalyzing\(false\)/);
  assert.doesNotMatch(source, /\}, \[song\]\);/);
  assert.match(source, /\[song\?\.id, song\?\.title, song\?\.artist, song\?\.lyrics, song\?\.creative_direction, song\?\.notes, song\?\.visual_style_preferences\]/);
});
