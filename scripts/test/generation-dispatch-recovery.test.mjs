import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

function fixture({ status = 'processing', age = 0, upstream = null, race = null, persistError = null } = {}) {
  const original = { id: 'job-recovery', job_type: 'scene_motion', status, updated_at: new Date(Date.now() - age).toISOString(), output: upstream ? { upstream_job_id: upstream } : {} };
  let row = structuredClone(original);
  let writes = 0;
  let selectedStatuses;
  const client = {
    rpc: async () => ({ data: 'test-queue-secret' }),
    from(table) {
      assert.equal(table, 'generation_jobs');
      let changes;
      const filters = {};
      return {
        update(value) { changes = value; return this; },
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        in(key, value) { selectedStatuses = value; return this; },
        order() { return this; },
        async limit() { return { data: [structuredClone(original)] }; },
        async maybeSingle() {
          if (persistError) return { error: { message: persistError } };
          if (race) row = structuredClone(race);
          if (Object.entries(filters).some(([key, value]) => row[key] !== value)) return { data: null };
          if (changes) { writes++; Object.assign(row, changes); }
          return { data: structuredClone(row) };
        },
        async single() { return { data: structuredClone(row) }; },
      };
    },
  };
  return { original, client, state: () => ({ row, writes, selectedStatuses }) };
}

for (const status of ['submitted', 'processing']) test('fresh ' + status + ' dispatch remains pending without upstream ID', async () => {
  const f = fixture({ status });
  const runtime = await loadGeneration();
  try {
    assert.equal((await runtime.poll(f.client, f.original)).status, status);
    assert.equal(f.state().writes, 0);
  } finally { await runtime.cleanup(); }
});

for (const status of ['submitted', 'processing']) test('interrupted ' + status + ' dispatch fails explicitly after grace without resubmission', async () => {
  const f = fixture({ status, age: 6 * 60 * 1000 });
  const runtime = await loadGeneration();
  try {
    const result = await runtime.poll(f.client, f.original);
    assert.equal(result.status, 'failed');
    assert.match(result.error.message, /without a provider job id/);
    assert.match(result.error.message, /automatic resubmission is disabled/);
    assert.equal(f.state().writes, 1);
  } finally { await runtime.cleanup(); }
});

test('submitted job with persisted upstream ID resumes processing without replacing output', async () => {
  const f = fixture({ status: 'submitted', upstream: 'known-provider-id' });
  const runtime = await loadGeneration();
  try {
    const result = await runtime.poll(f.client, f.original);
    assert.equal(result.status, 'processing');
    assert.deepEqual(result.output, { upstream_job_id: 'known-provider-id' });
  } finally { await runtime.cleanup(); }
});

test('stale missing-ID recovery cannot fail a concurrently updated dispatch', async () => {
  const race = { id: 'job-recovery', status: 'processing', updated_at: new Date().toISOString(), output: { upstream_job_id: 'accepted-provider-id' } };
  const f = fixture({ age: 6 * 60 * 1000, race });
  const runtime = await loadGeneration();
  try {
    assert.deepEqual(await runtime.poll(f.client, f.original), race);
    assert.equal(f.state().writes, 0);
  } finally { await runtime.cleanup(); }
});

test('stale recovery preserves a concurrently completed job', async () => {
  const race = { id: 'job-recovery', status: 'completed', updated_at: new Date().toISOString(), output: { motion_clip_asset: { id: 'approved-asset', approved: true } } };
  const f = fixture({ status: 'submitted', age: 6 * 60 * 1000, race });
  const runtime = await loadGeneration();
  try {
    assert.deepEqual(await runtime.poll(f.client, f.original), race);
    assert.equal(f.state().writes, 0);
  } finally { await runtime.cleanup(); }
});

test('recovery database failure is surfaced instead of reporting success', async () => {
  const f = fixture({ status: 'submitted', age: 6 * 60 * 1000, persistError: 'database unavailable' });
  const runtime = await loadGeneration();
  try {
    await assert.rejects(runtime.poll(f.client, f.original), /DISPATCH_RECOVERY_PERSIST_FAILED: database unavailable/);
  } finally { await runtime.cleanup(); }
});

test('scheduler scans and recovers submitted jobs', async () => {
  const f = fixture({ status: 'submitted', age: 6 * 60 * 1000 });
  const runtime = await loadGeneration(f.client);
  try {
    const response = await runtime.handler(new Request('https://test/function', {
      method: 'POST', headers: { 'X-BeatVision-Queue-Secret': 'test-queue-secret', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'drain' }),
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.results[0].action, 'poll');
    assert.equal(result.results[0].status, 'failed');
    assert.ok(f.state().selectedStatuses.includes('submitted'));
  } finally { await runtime.cleanup(); }
});
