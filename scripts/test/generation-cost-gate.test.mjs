import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

const ARENA = { ARENA_GATEWAY_URL: 'https://arena.test', ARENA_GATEWAY_TOKEN: 'secret' };

// Minimal in-memory query builder covering the calls the controller makes.
function fakeDb({ approvals = [], job }) {
  const tables = { generation_cost_approvals: approvals, generation_jobs: [job] };
  const log = [];
  const from = (name) => {
    const filters = [];
    let patch = null;
    const rows = () => (tables[name] || []).filter((row) => filters.every((f) => f(row)));
    const q = {
      select() { return q; },
      eq(k, v) { filters.push((r) => r[k] === v); return q; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
      gt(k, v) { filters.push((r) => r[k] > v); return q; },
      in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; },
      order() { return q; },
      limit() { return q; },
      update(p) { patch = p; log.push({ name, patch: p }); return q; },
      async maybeSingle() { return finish(true); },
      async single() { return finish(true); },
      then(resolve) { return resolve(finish(false)); },
    };
    function finish(one) {
      const matched = rows();
      if (patch) for (const row of matched) Object.assign(row, patch);
      return { data: one ? matched[0] ?? null : matched, error: null };
    }
    return q;
  };
  return { db: { from, storage: {} }, log, tables };
}

const baseJob = () => ({ id: 'job-1', project_id: 'p1', visual_plan_id: 'vp1', visual_plan_scene_id: 's1', job_type: 'scene_image', status: 'queued', attempts: 0, input_snapshot: {} });
const approval = (over = {}) => ({ id: 'a1', project_id: 'p1', visual_plan_id: 'vp1', scene_id: 's1', job_type: 'scene_image', model_id: 'arena:flux-schnell', pricing_version: '2026-10-14.1', expires_at: '2999-01-01T00:00:00Z', consumed_by_job_id: null, ...over });

async function withFetchSpy(fn) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return new Response(JSON.stringify({ status: 'failed' }), { status: 500 }); };
  try { return await fn(calls); } finally { globalThis.fetch = original; }
}

test('paid job without a recorded approval is rejected and no provider is called', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    await withFetchSpy(async (calls) => {
      const { db } = fakeDb({ job: baseJob() });
      const result = await runtime.run(db, baseJob());
      assert.equal(result.status, 'failed');
      assert.equal(result.error.code, 'COST_APPROVAL_REQUIRED');
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('approval for a different scene does not authorize the job', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    await withFetchSpy(async (calls) => {
      const { db } = fakeDb({ job: baseJob(), approvals: [approval({ scene_id: 'other' })] });
      const result = await runtime.run(db, baseJob());
      assert.equal(result.error.code, 'COST_APPROVAL_REQUIRED');
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('expired and already-consumed approvals are rejected', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    await withFetchSpy(async (calls) => {
      for (const stale of [approval({ expires_at: '2000-01-01T00:00:00Z' }), approval({ consumed_by_job_id: 'job-0' })]) {
        const { db } = fakeDb({ job: baseJob(), approvals: [stale] });
        const result = await runtime.run(db, baseJob());
        assert.equal(result.error.code, 'COST_APPROVAL_REQUIRED');
      }
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('approval at an outdated pricing version is stale', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    await withFetchSpy(async (calls) => {
      const { db } = fakeDb({ job: baseJob(), approvals: [approval({ pricing_version: 'old' })] });
      const result = await runtime.run(db, baseJob());
      assert.equal(result.error.code, 'COST_APPROVAL_STALE');
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('model approved for another job type is not supported', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    await withFetchSpy(async (calls) => {
      const { db } = fakeDb({ job: baseJob(), approvals: [approval({ model_id: 'arena:ltx-video' })] });
      const result = await runtime.run(db, baseJob());
      assert.equal(result.error.code, 'MODEL_NOT_SUPPORTED');
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('missing server provider config fails explicitly as PROVIDER_UNAVAILABLE', async () => {
  const runtime = await loadGeneration({}, {});
  try {
    await withFetchSpy(async (calls) => {
      const { db, tables } = fakeDb({ job: baseJob(), approvals: [approval()] });
      const result = await runtime.run(db, baseJob());
      assert.equal(result.error.code, 'PROVIDER_UNAVAILABLE');
      assert.match(result.error.message, /ARENA_GATEWAY_URL/);
      assert.equal(tables.generation_cost_approvals[0].consumed_by_job_id, null, 'approval is not consumed when the provider is unavailable');
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('valid approval is consumed once, linked to the job, and the approved model is sent', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    await withFetchSpy(async (calls) => {
      const { db, tables } = fakeDb({ job: baseJob(), approvals: [approval()] });
      const gated = await runtime.resolveApprovedModel(db, baseJob());
      assert.equal(gated.model.providerModel, 'flux-schnell');
      assert.equal(tables.generation_cost_approvals[0].consumed_by_job_id, 'job-1');
      // Re-resolving for the same job reuses the linked approval.
      const again = await runtime.resolveApprovedModel(db, baseJob());
      assert.equal(again.approval.id, 'a1');
      // The same approval cannot authorize a second job.
      await assert.rejects(runtime.resolveApprovedModel(db, { ...baseJob(), id: 'job-2' }), /COST_APPROVAL_REQUIRED/);
      assert.equal(calls.length, 0);
    });
  } finally { await runtime.cleanup(); }
});

test('approved motion model is forwarded to the bridge payload', async () => {
  const runtime = await loadGeneration({}, ARENA);
  try {
    const job = { ...baseJob(), job_type: 'scene_image', input_snapshot: { scene: { id: 's1' }, vision_snapshot: { song: { analysis: { duration_seconds: 30 } } } } };
    const payload = await runtime.bridgePayload({}, job, 'flux-schnell');
    assert.equal(payload.generation.model, 'flux-schnell');
    assert.notEqual(payload.generation.cost_class, 'free', 'payload no longer asserts a free cost class');
  } finally { await runtime.cleanup(); }
});

test('models action lists explicit unavailable states without leaking secrets', async () => {
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } };
  for (const [envVars, available] of [[{}, false], [ARENA, true]]) {
    const runtime = await loadGeneration(client, envVars);
    try {
      const response = await runtime.handler(new Request('https://test/fn', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'models' }) }));
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.ok(body.models.length >= 4);
      for (const model of body.models) {
        assert.equal(model.available, available);
        assert.equal(model.requires_approval, true);
        if (!available) assert.match(model.unavailable_reason, /Not configured/);
      }
      assert.ok(!JSON.stringify(body).includes('secret'));
    } finally { await runtime.cleanup(); }
  }
});
