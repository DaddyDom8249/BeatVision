import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CATALOG, DEFAULT_MODEL, PRICING_VERSION, estimateCost, formatEstimate, findModel, modelsFor, requiresApproval } from '../../supabase/functions/_shared/model-catalog.ts';

test('every model records pricing sources with URL and read date', () => {
  for (const model of MODEL_CATALOG) {
    assert.ok(model.pricing.sources.length > 0, model.id);
    for (const source of model.pricing.sources) {
      assert.match(source.url, /^https:\/\//);
      assert.match(source.readOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(source.note.length > 10);
    }
  }
  assert.match(PRICING_VERSION, /^\d{4}-\d{2}-\d{2}\./);
});

test('no Arena-routed model is treated as verifiably free; all require approval', () => {
  for (const model of MODEL_CATALOG) {
    assert.equal(model.verifiedFree, false, model.id);
    assert.equal(requiresApproval(model), true, model.id);
  }
});

test('a verifiably free model may skip approval', () => {
  const free = { ...MODEL_CATALOG[0], verifiedFree: true, pricing: { ...MODEL_CATALOG[0].pricing, minUsd: 0, maxUsd: 0 } };
  assert.equal(requiresApproval(free), false);
  assert.equal(estimateCost(free).kind, 'free');
});

test('unknown pricing shows "Cost unknown" and never a number', () => {
  for (const id of ['arena:ltx-video', 'arena:wan2.2-zerogpu', 'arena:shotstack']) {
    const estimate = estimateCost(findModel(id), { units: 5 });
    assert.equal(estimate.kind, 'unknown');
    assert.equal(formatEstimate(estimate), 'Cost unknown');
    assert.equal('maxUsd' in estimate, false);
  }
});

test('flux schnell estimate uses the documented Pixazo range', () => {
  const estimate = estimateCost(findModel('arena:flux-schnell'));
  assert.deepEqual([estimate.kind, estimate.minUsd, estimate.maxUsd], ['range', 0, 0.0012]);
  assert.equal(formatEstimate(estimate), '$0–$0.0012');
  assert.equal(estimateCost(findModel('arena:flux-schnell'), { units: 0 }).kind, 'unknown');
});

test('defaults exist for each job type and lookups are type-safe', () => {
  for (const [type, id] of Object.entries(DEFAULT_MODEL)) assert.equal(findModel(id).jobType, type);
  assert.equal(findModel('nope'), null);
  assert.equal(modelsFor('scene_motion').length, 2);
});
