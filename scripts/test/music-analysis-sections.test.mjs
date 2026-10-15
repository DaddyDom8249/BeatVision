import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(new URL('../../src/lib/musicAnalysis.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText;

async function analyzeFixture(durationSeconds, pattern) {
  const sampleRate = 8000;
  const sampleCount = Math.round(sampleRate * durationSeconds);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const time = i / sampleRate;
    const amplitude = pattern === 'transitions'
      ? (time < 7 ? 0.04 : time < 14 ? 0.7 : time < 21 ? 0.08 : 0.6)
      : pattern === 'silence' ? 0 : 0.3;
    samples[i] = amplitude * Math.sin(2 * Math.PI * 220 * time);
  }
  let closed = false;
  class FakeAudioContext {
    async decodeAudioData() {
      return {
        duration: sampleCount / sampleRate, sampleRate, numberOfChannels: 1,
        getChannelData(index) {
          assert.equal(index, 0);
          return samples;
        },
      };
    }
    async close() { closed = true; }
  }
  const fakeFetch = async () => ({
    ok: true, arrayBuffer: async () => new ArrayBuffer(4),
  });
  const module = { exports: {} };
  // Execute the actual TypeScript-transpiled DSP, not a copied section algorithm.
  new Function('module', 'exports', 'fetch', 'AudioContext', code)(
    module, module.exports, fakeFetch, FakeAudioContext
  );
  const output = await module.exports.analyzeAudioLocally('fixture://audio');
  assert.equal(closed, true, 'AudioContext must be closed');
  return output;
}

function assertValidSections(analysis) {
  const sections = analysis.sections;
  assert.ok(Array.isArray(sections) && sections.length >= 1);
  assert.equal(sections[0].start_time, 0);
  assert.equal(sections.at(-1).end_time, analysis.duration_seconds);
  for (const [index, section] of sections.entries()) {
    assert.equal(section.index, index + 1);
    assert.ok(Number.isFinite(section.start_time) && Number.isFinite(section.end_time));
    assert.ok(section.start_time >= 0, 'section start must be non-negative');
    assert.ok(section.end_time > section.start_time, 'zero-duration sections are invalid');
    assert.ok(section.end_time <= analysis.duration_seconds, 'section cannot exceed track');
    if (index) assert.equal(section.start_time, sections[index - 1].end_time,
      'sections must cover the track without gaps or overlaps');
  }
}

test('silence has one valid complete section, not an extra zero-length ending section', async () => {
  const output = await analyzeFixture(12, 'silence');
  assertValidSections(output);
  assert.equal(output.sections.length, 1);
});

test('energy transitions yield contiguous sections accepted by the database validator', async () => {
  const output = await analyzeFixture(28, 'transitions');
  assertValidSections(output);
  assert.ok(output.sections.length > 1, 'real energy changes should create region boundaries');
});

test('short decoded audio still produces a positive-duration section', async () => {
  const output = await analyzeFixture(0.2, 'tone');
  assertValidSections(output);
  assert.equal(output.sections.length, 1);
});
