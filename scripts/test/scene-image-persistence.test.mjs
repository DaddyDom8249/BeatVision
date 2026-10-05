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


test("motion clip persistence contract exists", () => {
  const motionMigration = fs.readFileSync("supabase/migrations/20261005110000_motion_clip_persistence.sql", "utf8");
  assert.ok(motionMigration.includes("public.motion_clips"));
  assert.ok(motionMigration.includes("generation_job_id uuid not null references public.generation_jobs"));
  assert.ok(motionMigration.includes("motion_clips_job_unique"));
  assert.ok(motionMigration.includes("MOTION_CLIP_LINEAGE_INVALID"));
  assert.ok(motionMigration.includes("job_status not in ('processing', 'completed')"));
  const sceneMigration = fs.readFileSync("supabase/migrations/20261005100000_scene_image_persistence.sql", "utf8");
  assert.ok(sceneMigration.includes("job_status not in ('processing', 'completed')"));
  assert.ok(motionMigration.includes("revoke insert, update, delete on public.motion_clips from anon, authenticated"));
  assert.ok(controller.includes("extractMotionClip"));
  assert.ok(controller.includes('from("motion_clips")'));
  assert.ok(controller.includes("video_url: media.video_url"));
  assert.ok(controller.includes("persistMotionClip(db, job, result.data)"));
  assert.ok(controller.includes("motion_clip_id: motionClip.id"));
});
