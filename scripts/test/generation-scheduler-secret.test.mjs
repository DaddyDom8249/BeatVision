// Regression: the scheduler secret grants cross-tenant "system" identity, so a
// wrong secret must be rejected explicitly (401) and compared in constant time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGeneration } from './generation-runtime.mjs';

const SECRET = 'scheduler-secret-0123456789abcdef0123456789';
const client = {
  rpc: async (name) => name === 'get_generation_scheduler_secret' ? { data: SECRET, error: null } : { data: null, error: new Error('unexpected rpc') },
  from: () => { throw new Error('no table access expected'); },
  auth: { getUser: async () => ({ data: { user: null }, error: new Error('no') }) },
};

const req = (secret) => new Request('https://test/function', {
  method: 'POST',
  headers: { 'X-BeatVision-Queue-Secret': secret, 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'noop' }),
});

test('wrong scheduler secret is rejected with 401 UNAUTHORIZED_SCHEDULER', async () => {
  const runtime = await loadGeneration(client);
  try {
    for (const bad of ['x', SECRET.slice(0, -1), SECRET + 'x', SECRET.slice(0, -1) + 'Z']) {
      const res = await runtime.handler(req(bad));
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error.code, 'UNAUTHORIZED_SCHEDULER');
    }
  } finally { await runtime.cleanup(); }
});

test('correct scheduler secret passes authentication', async () => {
  const runtime = await loadGeneration(client);
  try {
    const res = await runtime.handler(req(SECRET));
    const body = await res.json();
    assert.notEqual(body?.error?.code, 'UNAUTHORIZED_SCHEDULER');
    assert.notEqual(body?.error?.code, 'UNAUTHENTICATED');
  } finally { await runtime.cleanup(); }
});

test('scheduler secret is not compared with ===', async () => {
  const src = await readFile(new URL('../../supabase/functions/beatvision-generation/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /queueSecret\s*===/);
});
