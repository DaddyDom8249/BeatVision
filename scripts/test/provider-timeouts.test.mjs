// Regression: outbound provider calls must be bounded so a hung provider
// becomes an explicit failure instead of a job stuck in processing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGeneration } from './generation-runtime.mjs';

const ENV = { ARENA_GATEWAY_URL: 'https://arena.test', ARENA_GATEWAY_TOKEN: 't' };

test('arena() passes an abort signal and maps timeouts to ARENA_TIMEOUT', async () => {
  const runtime = await loadGeneration({}, ENV);
  const original = globalThis.fetch;
  let seen;
  try {
    globalThis.fetch = async (_url, init) => { seen = init; throw new DOMException('timed out', 'TimeoutError'); };
    await assert.rejects(runtime.arena('/v2/x', 'GET', null, 'r'), /ARENA_TIMEOUT/);
    assert.ok(seen.signal instanceof AbortSignal, 'fetch must receive a timeout signal');
  } finally { globalThis.fetch = original; await runtime.cleanup(); }
});

test('analyze-song Groq call is bounded by a timeout', async () => {
  const src = await readFile(new URL('../../supabase/functions/beatvision-analyze-song/index.ts', import.meta.url), 'utf8');
  assert.match(src, /api\.groq\.com[\s\S]{0,300}AbortSignal\.timeout\(/);
  assert.match(src, /GROQ_TIMEOUT/);
});
