// Regression: base64 scene-image output must be a real image (magic bytes) and
// be stored with its true content type; arbitrary bytes are never persisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGeneration } from './generation-runtime.mjs';

function makeDb() {
  const uploads = [], inserts = [];
  const chain = (table) => ({
    select() { return this; }, eq() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert(row) { inserts.push({ table, row }); return { select: () => ({ single: async () => ({ data: { id: 'asset-1', ...row }, error: null }) }) }; },
  });
  return {
    uploads, inserts,
    from: chain,
    storage: { from: () => ({
      upload: async (path, bytes, opts) => { uploads.push({ path, bytes, opts }); return { error: null }; },
      createSignedUrl: async (path) => ({ data: { signedUrl: 'https://signed.test/' + path }, error: null }),
    }) },
  };
}
const job = { id: 'job-1', job_type: 'scene_image', project_id: 'p', visual_plan_id: 'v', visual_plan_scene_id: 's' };

test('non-image base64 payload fails with SCENE_IMAGE_NOT_IMAGE and stores nothing', async () => {
  const db = makeDb();
  const runtime = await loadGeneration(db);
  try {
    await assert.rejects(runtime.persistSceneImage(db, job, { image_base64: Buffer.from('hello world').toString('base64') }), /SCENE_IMAGE_NOT_IMAGE/);
    assert.equal(db.uploads.length, 0);
    assert.equal(db.inserts.length, 0);
  } finally { await runtime.cleanup(); }
});

test('PNG base64 is stored with image/png content type', async () => {
  const db = makeDb();
  const runtime = await loadGeneration(db);
  try {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    await runtime.persistSceneImage(db, job, { image_base64: png.toString('base64') });
    assert.equal(db.uploads[0].opts.contentType, 'image/png');
    assert.match(db.uploads[0].path, /\.png$/);
    assert.equal(db.inserts[0].row.approved, false);
  } finally { await runtime.cleanup(); }
});

test('JPEG base64 (data URL) is stored as image/jpeg', async () => {
  const db = makeDb();
  const runtime = await loadGeneration(db);
  try {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
    await runtime.persistSceneImage(db, job, { image_base64: 'data:image/jpeg;base64,' + jpg.toString('base64') });
    assert.equal(db.uploads[0].opts.contentType, 'image/jpeg');
    assert.match(db.uploads[0].path, /\.jpg$/);
  } finally { await runtime.cleanup(); }
});
