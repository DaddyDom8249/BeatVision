import assert from "node:assert/strict";
import fs from "node:fs";

const controller = fs.readFileSync(
  new URL("../../supabase/functions/beatvision-generation/index.ts", import.meta.url),
  "utf8",
);
const imageMigration = fs.readFileSync(
  new URL("../../supabase/migrations/20261005100000_scene_image_persistence.sql", import.meta.url),
  "utf8",
);
const motionMigration = fs.readFileSync(
  new URL("../../supabase/migrations/20261005110000_motion_clip_persistence.sql", import.meta.url),
  "utf8",
);

assert.match(controller, /from("scene_image_assets")/g);
assert.match(controller, /from("motion_clip_assets")/g);
assert.doesNotMatch(controller, /from("scene_images")|from("motion_clips")/);

assert.match(imageMigration, /create table if not exists public\.scene_image_assets/);
assert.match(motionMigration, /create table if not exists public\.motion_clip_assets/);
assert.match(motionMigration, /references public\.scene_image_assets\(id\)/);

console.log("PASS: canonical controller and migrations use isolated asset tables.");
