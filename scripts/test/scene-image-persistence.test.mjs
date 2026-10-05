import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  "supabase/migrations/20261005100000_scene_image_persistence.sql",
  "utf8"
);
const controller = fs.readFileSync(
  "supabase/functions/beatvision-generation/index.ts",
  "utf8"
);

test("scene image persistence contract exists and is owner-readable only", () => {
  assert.match(migration, /create table if not exists public\.scene_images/);
  assert.match(migration, /generation_job_id uuid not null references public\.generation_jobs/);
  assert.match(migration, /constraint scene_images_job_unique unique \(generation_job_id\)/);
  assert.match(migration, /scene_images_owner_select/);
  assert.match(migration, /revoke insert, update, delete on public\.scene_images from anon, authenticated/);
  assert.match(migration, /SCENE_IMAGE_LINEAGE_INVALID/);
});

test("completed scene-image jobs persist the real Arena media URL before completion", () => {
  assert.match(controller, /function extractSceneImage/);
  assert.match(controller, /from\("scene_images"\)/);
  assert.match(controller, /generation_job_id: job\.id/);
  assert.match(controller, /image_url: media\.image_url/);
  assert.match(controller, /persistSceneImage\(db, job, result\.data\)/);
  assert.match(controller, /scene_image_id: sceneImage\.id/);
});
