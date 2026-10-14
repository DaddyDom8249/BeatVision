import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadGeneration } from './generation-runtime.mjs';

const src = new URL('../../src/lib/beatvision/motion/cameraPresets.ts', import.meta.url);
const shared = new URL('../../supabase/functions/_shared/camera-presets.ts', import.meta.url);
const m = await import(shared.href);

test('frontend and edge copies of camera presets are identical', async () => {
  assert.equal(await readFile(src, 'utf8'), await readFile(shared, 'utf8'));
});

test('BPM grid: 120 BPM gives 0.5s beats aligned to absolute song time', () => {
  const t = m.computeSceneTiming({ start_time: 10.2, end_time: 12.1 }, { duration_seconds: 180, bpm: 120, bpm_confidence: 0.8 });
  assert.equal(t.source, 'bpm_grid');
  assert.equal(t.beat_seconds, 0.5);
  assert.deepEqual(t.accents_seconds, [10.5, 11, 11.5, 12]);
  assert.match(t.note, /Estimated beat grid from analyzed BPM 120 \(BPM confidence 80%\).*Not detected beat times/);
});

test('beat on scene start is included; scene end is excluded', () => {
  assert.deepEqual(m.bpmGridTimes(60, 2, 5), [2, 3, 4]);
  assert.deepEqual(m.bpmGridTimes(90, 0, 2), [0, 0.667, 1.333]);
});

test('scene times are clamped to the real song duration', () => {
  const t = m.computeSceneTiming({ start_time: -3, end_time: 999 }, { duration_seconds: 42.5, bpm: 100 });
  assert.equal(t.start_seconds, 0);
  assert.equal(t.end_seconds, 42.5);
  assert.ok(t.accents_seconds.every((a) => a >= 0 && a < 42.5));
  assert.throws(() => m.clampSceneRange(50, 60, 42.5), /CAMERA_TIMING_RANGE_INVALID/);
  assert.throws(() => m.computeSceneTiming({ start_time: 0, end_time: 5 }, { bpm: 120 }), /CAMERA_TIMING_DURATION_MISSING/);
});

test('falls back to sections when BPM is missing or implausible, and labels it', () => {
  const analysis = { duration_seconds: 60, bpm: 900, sections: [{ index: 1, start_time: 0, end_time: 20 }, { index: 2, start_time: 20, end_time: 60 }] };
  const t = m.computeSceneTiming({ start_time: 15, end_time: 30 }, analysis);
  assert.equal(t.source, 'sections');
  assert.equal(t.beat_seconds, null);
  assert.deepEqual(t.accents_seconds, [20]);
  assert.match(t.note, /No usable BPM.*section boundaries.*No beat timing/);
});

test('falls back to scene bounds with no BPM or sections and never invents beats', () => {
  const t = m.computeSceneTiming({ start_time: 5, end_time: 9 }, { duration_seconds: 30, bpm: null });
  assert.equal(t.source, 'scene_bounds');
  assert.deepEqual(t.accents_seconds, [5]);
  assert.match(t.note, /No BPM or sections/);
  const d = m.presetToDirective('push_in', t);
  assert.doesNotMatch(d.prompt_directive, /BPM|beat/i);
});

test('preset-to-directive mapping', () => {
  const t = m.computeSceneTiming({ start_time: 10.2, end_time: 12.1 }, { duration_seconds: 180, bpm: 120 });
  for (const id of m.CAMERA_PRESET_IDS) {
    const d = m.presetToDirective(id, t);
    assert.equal(d.preset, id);
    assert.match(d.prompt_directive, /^CAMERA MOVE: /);
    assert.equal(d.timing_source, 'bpm_grid');
    assert.ok(d.parameters.move_end_seconds <= t.duration_seconds);
  }
  const push = m.presetToDirective('push_in', t);
  assert.deepEqual([push.parameters.camera_move, push.parameters.direction], ['dolly', 'in']);
  assert.equal(push.parameters.move_start_seconds, 0.3);
  assert.deepEqual(push.parameters.accent_offsets_seconds, [0.3, 0.8, 1.3, 1.8]);
  const still = m.presetToDirective('static', t);
  assert.equal(still.parameters.camera_move, 'none');
  assert.equal(still.parameters.move_end_seconds, 0);
  const whip = m.presetToDirective('whip_pan', t);
  assert.equal(whip.parameters.move_start_seconds, 1.8);
  assert.throws(() => m.presetToDirective('dolly_zoom', t), /CAMERA_PRESET_UNKNOWN/);
  assert.equal(m.isCameraPresetId('orbit'), true);
  assert.equal(m.isCameraPresetId('nope'), false);
});

test('migration lists exactly the preset ids and is flagged for manual apply', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/20261014150000_scene_camera_presets.sql', import.meta.url), 'utf8');
  assert.match(sql, /REQUIRES MANUAL APPLY/);
  const ids = [...sql.match(/preset in \(([^)]*)\)/s)[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual(ids, [...m.CAMERA_PRESET_IDS]);
});

function motionDb(presetResult) {
  const chain = (result) => { const c = { select: () => c, eq: () => c, order: () => c, limit: () => c, maybeSingle: async () => result }; return c; };
  return { from: (table) => table === 'scene_camera_presets' ? chain(presetResult)
    : chain({ data: { id: 'img', image_url: 'https://cdn.test/a.jpg', storage_path: null, scene_id: 'scene-1', status: 'approved', approved: true }, error: null }) };
}
const job = { id: 'job-1', project_id: 'p', visual_plan_id: 'plan', visual_plan_scene_id: 'scene-1', job_type: 'scene_motion', idempotency_key: 'k',
  input_snapshot: { scene: { id: 'scene-1', start_time: 4, end_time: 8 }, vision_snapshot: { song: { analysis: { duration_seconds: 6, bpm: 120 } } } } };

test('scene_motion payload carries the stored preset directive, clamped to song duration', async () => {
  const g = await loadGeneration();
  try {
    const payload = await g.bridgePayload(motionDb({ data: { preset: 'orbit' }, error: null }), job);
    assert.equal(payload.camera_motion.preset, 'orbit');
    assert.equal(payload.camera_motion.timing_source, 'bpm_grid');
    assert.equal(payload.camera_motion.parameters.move_end_seconds, 2);
    assert.match(payload.scene.camera_motion_directive, /orbits clockwise/);
  } finally { await g.cleanup(); }
});

test('scene_motion payload is unchanged without a preset or before the migration is applied', async () => {
  const g = await loadGeneration();
  try {
    for (const r of [{ data: null, error: null }, { data: null, error: { code: '42P01', message: 'missing' } }]) {
      const payload = await g.bridgePayload(motionDb(r), job);
      assert.equal('camera_motion' in payload, false);
      assert.equal('camera_motion_directive' in payload.scene, false);
    }
    await assert.rejects(g.bridgePayload(motionDb({ data: null, error: { code: 'XX000', message: 'boom' } }), job), /CAMERA_PRESET_LOOKUP_FAILED/);
  } finally { await g.cleanup(); }
});
