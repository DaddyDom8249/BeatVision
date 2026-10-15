import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

const job = { id: 'job-1', job_type: 'scene_motion', project_id: 'project-1', visual_plan_id: 'plan-1', visual_plan_scene_id: 'scene-1' };
const output = { video_url: 'https://example.test/late.mp4', provider: 'shotstack', model: 'image-motion' };

function fixture({ existing = null, concurrent = null, lookupError = null, insertError = null } = {}) {
  let row = existing;
  let writes = 0;
  let imageReads = 0;
  const client = {
    from(table) {
      if (table === 'scene_image_assets') {
        imageReads++;
        return { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, async maybeSingle() { return { data: { id: 'image-new' } }; } };
      }
      assert.equal(table, 'motion_clip_assets');
      return {
        select() { return this; },
        eq(key, value) { assert.equal(key, 'generation_job_id'); assert.equal(value, job.id); return this; },
        async maybeSingle() { return { data: row, error: lookupError }; },
        insert(value) {
          writes++;
          if (concurrent) row = concurrent;
          else if (!insertError) row = { id: 'new-asset', ...value };
          return { select() { return { async single() { return { data: concurrent ? null : row, error: concurrent ? { code: '23505', message: 'duplicate job' } : insertError }; } }; } };
        },
        upsert() { throw new Error('Completion must never overwrite a persisted motion asset'); },
      };
    },
  };
  return { client, counts: () => ({ writes, imageReads }) };
}

for (const status of ['approved', 'rejected']) test('duplicate motion completion preserves ' + status + ' asset', async () => {
  const existing = { id: 'asset-original', generation_job_id: job.id, approved: status === 'approved', status, video_url: 'https://example.test/original.mp4', scene_image_id: 'image-original' };
  const f = fixture({ existing });
  const runtime = await loadGeneration();
  try {
    assert.deepEqual(await runtime.persistMotionClip(f.client, job, output), existing);
    assert.deepEqual(f.counts(), { writes: 0, imageReads: 0 });
  } finally { await runtime.cleanup(); }
});

test('concurrent motion completion returns winning asset without replacing creator approval', async () => {
  const concurrent = { id: 'winner', generation_job_id: job.id, approved: true, status: 'approved', video_url: 'https://example.test/winner.mp4', scene_image_id: 'image-original' };
  const f = fixture({ concurrent });
  const runtime = await loadGeneration();
  try {
    assert.deepEqual(await runtime.persistMotionClip(f.client, job, output), concurrent);
    assert.equal(f.counts().writes, 1);
  } finally { await runtime.cleanup(); }
});

test('first motion completion persists actual provenance and remains unapproved', async () => {
  const f = fixture();
  const runtime = await loadGeneration();
  try {
    const asset = await runtime.persistMotionClip(f.client, job, output);
    assert.equal(asset.approved, false);
    assert.equal(asset.status, 'generated');
    assert.equal(asset.provider, 'shotstack');
    assert.equal(asset.model, 'image-motion');
    assert.equal(asset.scene_image_id, 'image-new');
    assert.equal(asset.generation_job_id, job.id);
    assert.equal(f.counts().writes, 1);
  } finally { await runtime.cleanup(); }
});

test('motion lookup failure prevents writes', async () => {
  const f = fixture({ lookupError: { message: 'database unavailable' } });
  const runtime = await loadGeneration();
  try {
    await assert.rejects(runtime.persistMotionClip(f.client, job, output), /MOTION_CLIP_CHECK_FAILED: database unavailable/);
    assert.deepEqual(f.counts(), { writes: 0, imageReads: 0 });
  } finally { await runtime.cleanup(); }
});

test('motion insert failure without a winning asset is surfaced', async () => {
  const f = fixture({ insertError: { message: 'constraint failure' } });
  const runtime = await loadGeneration();
  try {
    await assert.rejects(runtime.persistMotionClip(f.client, job, output), /MOTION_CLIP_PERSIST_FAILED: constraint failure/);
  } finally { await runtime.cleanup(); }
});
