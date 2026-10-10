import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

for (const terminalStatus of ['completed', 'failed']) test('stale pending poll returns concurrent ' + terminalStatus + ' state without failure write', async () => {
  const terminal = { id: 'job-race', status: terminalStatus, output: { motion_clip_asset: { id: 'asset-winner', approved: true } } };
  let conditionalWrites = 0;
  let failureWrites = 0;
  const client = {
    from(table) {
      assert.equal(table, 'generation_jobs');
      return {
        update() { conditionalWrites++; return this; },
        eq() { return this; },
        select() { return this; },
        in() { failureWrites++; return this; },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
        async single() { return { data: terminal }; },
      };
    },
  };
  const runtime = await loadGeneration();
  const originalFetch = globalThis.fetch;
  globalThis.Deno.env.get = key => ({ ARENA_GATEWAY_URL: 'https://provider.test', ARENA_GATEWAY_TOKEN: 'test-token' })[key] || '';
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'processing' }), { status: 200 });
  try {
    const result = await runtime.poll(client, { id: terminal.id, status: 'processing', job_type: 'scene_motion', output: { upstream_job_id: 'provider-id' } });
    assert.deepEqual(result, terminal);
    assert.equal(conditionalWrites, 1);
    assert.equal(failureWrites, 0);
  } finally { globalThis.fetch = originalFetch; await runtime.cleanup(); }
});

test('stale terminal failure poll returns concurrent completion instead of cascading another failure update', async () => {
  const terminal = { id: 'job-race', status: 'completed', output: { motion_clip_asset: { id: 'winner' } } };
  let failureWrites = 0;
  const client = { from() { return {
    update() { return this; }, eq() { return this; }, select() { return this; },
    in() { failureWrites++; return this; },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    async single() { return { data: terminal }; },
  }; } };
  const runtime = await loadGeneration();
  const originalFetch = globalThis.fetch;
  globalThis.Deno.env.get = key => ({ ARENA_GATEWAY_URL: 'https://provider.test', ARENA_GATEWAY_TOKEN: 'test-token' })[key] || '';
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'failed', error: 'late provider error' }), { status: 200 });
  try {
    assert.deepEqual(await runtime.poll(client, { id: terminal.id, status: 'processing', job_type: 'scene_motion', output: { upstream_job_id: 'provider-id' } }), terminal);
    assert.equal(failureWrites, 1);
  } finally { globalThis.fetch = originalFetch; await runtime.cleanup(); }
});

test('synchronous submission losing completion write returns winning persisted job', async () => {
  const base = { id: 'job-run-race', status: 'queued', job_type: 'scene_image', input_snapshot: { scene: {}, vision_snapshot: { song: { analysis: { duration_seconds: 60 } } } } };
  const winner = { ...base, status: 'completed', output: { scene_image_asset: { id: 'winning-image', approved: true } } };
  let failureWrites = 0;
  const client = { from(table) {
    if (table === 'scene_image_assets') return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: winner.output.scene_image_asset }; } };
    let changes;
    return {
      update(value) { changes = value; return this; }, eq() { return this; }, select() { return this; },
      in() { failureWrites++; return this; },
      async maybeSingle() { return { data: { ...base, ...changes } }; },
      async single() { return { data: changes ? { ...base, ...changes } : winner }; },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    };
  } };
  const runtime = await loadGeneration();
  const originalFetch = globalThis.fetch;
  globalThis.Deno.env.get = key => ({ ARENA_GATEWAY_URL: 'https://provider.test', ARENA_GATEWAY_TOKEN: 'test-token' })[key] || '';
  globalThis.fetch = async () => new Response(JSON.stringify({ image_url: 'https://example.test/image.jpg' }), { status: 200 });
  try {
    assert.deepEqual(await runtime.run(client, base), winner);
    assert.equal(failureWrites, 0);
  } finally { globalThis.fetch = originalFetch; await runtime.cleanup(); }
});
