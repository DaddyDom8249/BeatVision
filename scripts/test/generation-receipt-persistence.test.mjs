import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { loadGeneration } from './generation-runtime.mjs';
import { MODAL_MOTION } from '../../supabase/functions/beatvision-generation/modal-motion.ts';

const ids = [1, 2, 3, 4].map(n => `0000000${n}-0000-4000-8000-00000000000${n}`);
const receipt = 'fc-acceptedfixture';
const env = { MODAL_TOKEN_ID: 'fixture', MODAL_TOKEN_SECRET: 'fixture',
  BRAGORA_MODAL_GPU_ENABLED: 'true', BRAGORA_MODAL_BUDGET_VERIFIED: 'true' };

function fixture({ failure = 'none', concurrent = null, recoveryRace = false } = {}) {
  const source = PNG.sync.write(new PNG({ width: 2, height: 2 }));
  const image = { id: ids[2], project_id: ids[0], visual_plan_id: 'fixture-plan',
    scene_id: ids[1], approved: true, status: 'approved',
    storage_path: ids[0] + '/scene-images/synthetic.png' };
  let row = { id: ids[3], project_id: ids[0], visual_plan_id: image.visual_plan_id,
    visual_plan_scene_id: ids[1], job_type: 'scene_motion', status: 'queued', attempts: 0,
    updated_at: new Date(0).toISOString(), output: {}, input_snapshot: {
      modal_motion: { model: MODAL_MOTION.model, revision: MODAL_MOTION.revision, source_image_id: ids[2] },
      scene: { title: 'Synthetic approved motion scene' },
    } };
  const original = structuredClone(row);
  let receiptFailures = 0, failedWrites = 0, submits = 0, lookups = 0, clock = 1;
  let outage = failure === 'outage';
  const db = {
    from(table) {
      let patch;
      const filters = [];
      const execute = async () => {
        if (recoveryRace && patch?.output?.reconciliation_reason === 'PROVIDER_RECEIPT_PERSISTENCE_UNCERTAIN') {
          row = { ...row, output: { ...row.output, concurrent_check: true }, updated_at: new Date(clock++).toISOString() };
        }
        const record = table === 'scene_image_assets' ? image : row;
        assert.ok(['scene_image_assets', 'generation_jobs'].includes(table), 'No media or approval writes');
        if (filters.some(([key, values]) => !values.includes(record[key]))) return { data: null, error: null };
        if (patch) {
          assert.equal(table, 'generation_jobs');
          assert.deepEqual(row.input_snapshot, original.input_snapshot);
          if (patch.status === 'failed') failedWrites++;
          if (patch.output?.upstream_job_id && failure !== 'none' && (outage || receiptFailures === 0)) {
            receiptFailures++;
            if (concurrent) {
              row = { ...row, ...structuredClone(concurrent), updated_at: new Date(clock++).toISOString() };
            }
            if (failure === 'throw') throw new Error('INJECTED_RECEIPT_TRANSPORT_FAILURE');
            return { data: null, error: { message: 'INJECTED_RECEIPT_WRITE_FAILURE' } };
          }
          Object.assign(row, structuredClone(patch), { updated_at: new Date(clock++).toISOString() });
        }
        return { data: structuredClone(record), error: null };
      };
      return {
        update(value) { patch = value; return this; }, select() { return this; },
        eq(key, value) { filters.push([key, [value]]); return this; },
        in(key, values) { filters.push([key, values]); return this; },
        maybeSingle: execute, single: execute,
        then(resolve, reject) { return execute().then(result => resolve({ ...result,
          data: result.data ? [result.data] : [] }), reject); },
      };
    },
    storage: { from(bucket) { assert.equal(bucket, 'visual-assets'); return {
      download: async path => {
        if (path.endsWith('.proof.json')) return { data: null, error: { message: 'fixture checkpoint not yet stored' } };
        assert.equal(path, image.storage_path);
        return { data: new Blob([source]), error: null };
      },
    }; } },
  };
  const fetcher = async (url, options) => {
    if (options.method === 'POST') {
      assert.equal(url, MODAL_MOTION.apiBase + '/submit');
      submits++;
      return new Response(JSON.stringify({ status: 'processing', job_id: receipt }));
    }
    assert.equal(options.method, 'GET');
    assert.equal(url, MODAL_MOTION.apiBase + '/receipt/' + ids[3]);
    lookups++;
    return new Response(JSON.stringify({ status: 'processing', job_id: receipt }));
  };
  return { db, original, fetcher, row: () => structuredClone(row),
    stats: () => ({ receiptFailures, failedWrites, submits, lookups }),
    restoreDatabase() { outage = false; },
    age() { row.updated_at = row.output.dispatch_started_at = new Date(Date.now() - 6 * 60_000).toISOString(); },
  };
}

async function withRuntime(f, action) {
  const previous = globalThis.fetch;
  globalThis.fetch = f.fetcher;
  const runtime = await loadGeneration({}, env);
  try { return await action(runtime); }
  finally { globalThis.fetch = previous; await runtime.cleanup(); }
}

test('healthy accepted submission persists its receipt without reconciliation', async () => {
  const f = fixture();
  await withRuntime(f, async runtime => {
    const result = await runtime.run(f.db, f.original);
    assert.equal(result.status, 'processing');
    assert.equal(result.output.upstream_job_id, receipt);
    assert.equal(result.output.provider_receipt.upstream_job_id, receipt);
    assert.notEqual(result.output.reconciliation_required, true);
    assert.deepEqual(result.input_snapshot, f.original.input_snapshot);
    assert.deepEqual(f.stats(), { receiptFailures: 0, failedWrites: 0, submits: 1, lookups: 0 });
  });
});

for (const failure of ['response', 'throw']) test('accepted receipt survives ' + failure + ' persistence failure without resubmission', async () => {
  const f = fixture({ failure });
  await withRuntime(f, async runtime => {
    const result = await runtime.run(f.db, f.original);
    assert.equal(result.status, 'processing');
    assert.equal(result.output.upstream_job_id, receipt);
    assert.equal(result.output.provider_receipt.upstream_job_id, receipt);
    assert.equal(result.output.reconciliation_required, true);
    assert.equal(result.output.reconciliation_reason, 'PROVIDER_RECEIPT_PERSISTENCE_UNCERTAIN');
    assert.equal(result.output.automatic_resubmission_disabled, true);
    assert.deepEqual(result.input_snapshot, f.original.input_snapshot);
    assert.equal(f.stats().failedWrites, 0);
  });
  // Fresh workers with a stale queued copy must lose the durable claim before HTTP.
  await withRuntime(f, async runtime => {
    const retries = await Promise.allSettled([runtime.run(f.db, f.original), runtime.run(f.db, f.original)]);
    assert.ok(retries.every(result => result.status === 'rejected' && /already claimed/.test(result.reason.message)));
    assert.equal((await runtime.run(f.db, f.row())).status, 'processing');
  });
  assert.equal(f.stats().submits, 1);
  assert.equal(f.row().attempts, 1);
});

test('persistent receipt outage leaves claim recoverable; fresh worker adopts provider receipt with GET only', async () => {
  const f = fixture({ failure: 'outage' });
  await withRuntime(f, async runtime => {
    await assert.rejects(runtime.run(f.db, f.original), /PROVIDER_RECEIPT_RECONCILIATION_PERSIST_FAILED/);
  });
  assert.equal(f.row().status, 'processing');
  assert.equal(f.row().output.dispatch_intent.request_id, 'beatvision:' + ids[3]);
  assert.equal(f.stats().failedWrites, 0);
  f.restoreDatabase();
  f.age();
  await withRuntime(f, async runtime => {
    await assert.rejects(runtime.run(f.db, f.original), /already claimed/);
    const result = await runtime.poll(f.db, f.row());
    assert.equal(result.status, 'processing');
    assert.equal(result.output.upstream_job_id, receipt);
    assert.equal(result.output.provider_receipt.recovered, true);
    assert.deepEqual(result.input_snapshot, f.original.input_snapshot);
  });
  assert.deepEqual(f.stats(), { receiptFailures: 2, failedWrites: 0, submits: 1, lookups: 1 });
});

test('receipt recovery preserves concurrent terminal completion and approved output', async () => {
  const winner = { status: 'completed', output: { motion_clip_asset: { id: 'approved-winner', approved: true } } };
  const f = fixture({ failure: 'response', concurrent: winner });
  await withRuntime(f, async runtime => {
    const result = await runtime.run(f.db, f.original);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.output, winner.output);
    assert.equal(f.stats().failedWrites, 0);
  });
});

test('receipt reconciliation preserves execution metadata from another worker', async () => {
  const f = fixture({ failure: 'response', concurrent: { output: { last_polled_at: 'concurrent-check' } } });
  await withRuntime(f, async runtime => {
    const result = await runtime.run(f.db, f.original);
    assert.equal(result.output.last_polled_at, 'concurrent-check');
    assert.equal(result.output.upstream_job_id, receipt);
    assert.equal(result.output.reconciliation_required, true);
    assert.equal(f.stats().failedWrites, 0);
  });
});

test('receipt recovery cannot overwrite a newer row version', async () => {
  const f = fixture({ failure: 'response', recoveryRace: true });
  await withRuntime(f, async runtime => {
    await assert.rejects(runtime.run(f.db, f.original), /PROVIDER_RECEIPT_RECONCILIATION_RACE/);
  });
  assert.equal(f.row().status, 'processing');
  assert.equal(f.row().output.concurrent_check, true);
  assert.equal(f.stats().failedWrites, 0);
  assert.equal(f.stats().submits, 1);
});

test('receipt recovery cannot replace a conflicting stored receipt', async () => {
  const f = fixture({ failure: 'response', concurrent: { output: { upstream_job_id: 'fc-other-worker' } } });
  await withRuntime(f, async runtime => {
    await assert.rejects(runtime.run(f.db, f.original), /PROVIDER_RECEIPT_CONFLICT/);
  });
  assert.equal(f.row().status, 'processing');
  assert.equal(f.row().output.upstream_job_id, 'fc-other-worker');
  assert.equal(f.stats().failedWrites, 0);
  assert.equal(f.stats().submits, 1);
});
