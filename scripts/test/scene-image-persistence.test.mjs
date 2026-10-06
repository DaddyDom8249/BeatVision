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

function assertExecutableSql(sql, label) {
  assert.doesNotMatch(
    sql,
    /unique\s*\([^)]+\),\s*\)/i,
    `${label}: trailing comma before closing paren makes CREATE TABLE invalid PostgreSQL`
  );
  assert.doesNotMatch(
    sql,
    /,\s*\);/,
    `${label}: trailing comma before ); makes SQL invalid`
  );
  assert.doesNotMatch(
    sql,
    /as\s+\$\s*\n/,
    `${label}: single-$ function body opener is invalid; use $$ ... $$`
  );
  assert.doesNotMatch(
    sql,
    /\n\$;\s*\n/,
    `${label}: single-$ function body closer is invalid; use $$ ... $$`
  );

  const fns = [
    ...sql.matchAll(
      /create or replace function[\s\S]*?as\s+(\$[$\w]*)\s*\n[\s\S]*?\n(\$[$\w]*);/gi
    ),
  ];
  for (const match of fns) {
    const open = match[1];
    const close = match[2];
    assert.equal(
      open,
      close,
      `${label}: dollar-quote tags must match (open=${open}, close=${close})`
    );
    assert.ok(
      open.length >= 2,
      `${label}: dollar-quote tag must be at least $$ (got ${open})`
    );
  }
}

test("scene image migration is executable PostgreSQL", () => {
  assertExecutableSql(migration, "scene_image_assets");
  assert.match(migration, /as\s+\$\$/);
  assert.match(
    migration,
    /constraint scene_image_assets_lineage_unique unique \(scene_id, generation_job_id\)\s*\)/
  );
});

test("scene image persistence contract exists and is owner-readable only", () => {
  assert.match(migration, /create table if not exists public\.scene_image_assets/);
  assert.match(
    migration,
    /generation_job_id uuid not null references public\.generation_jobs/
  );
  assert.match(
    migration,
    /constraint scene_image_assets_job_unique unique \(generation_job_id\)/
  );
  assert.match(migration, /scene_image_assets_owner_select/);
  assert.match(
    migration,
    /revoke insert, update, delete on public\.scene_image_assets from anon, authenticated/
  );
  assert.match(migration, /SCENE_IMAGE_ASSET_LINEAGE_INVALID/);
  assert.match(migration, /job_status\s+not\s+in\s*\('processing'\s*,\s*'completed'\)/);
});

test("completed scene-image jobs persist the real Arena media URL before completion", () => {
  assert.match(controller, /function extractSceneImage/);
  assert.match(controller, /from\("scene_image_assets"\)/);
  assert.match(controller, /generation_job_id: job\.id/);
  assert.match(controller, /image_url: media\.image_url/);
  assert.match(controller, /persistSceneImage\(db, job, result\.data\)/);
  assert.match(controller, /scene_image_id: sceneImage\.id/);
});

test("motion clip persistence contract exists", () => {
  const motionMigration = fs.readFileSync(
    "supabase/migrations/20261005110000_motion_clip_persistence.sql",
    "utf8"
  );
  assertExecutableSql(motionMigration, "motion_clip_assets");
  assert.ok(motionMigration.includes("public.motion_clip_assets"));
  assert.ok(
    motionMigration.includes(
      "generation_job_id uuid not null references public.generation_jobs"
    )
  );
  assert.ok(motionMigration.includes("motion_clip_assets_job_unique"));
  assert.ok(motionMigration.includes("MOTION_CLIP_ASSET_LINEAGE_INVALID"));
  assert.ok(
    /job_status\s+not\s+in\s*\('processing'\s*,\s*'completed'\)/.test(motionMigration)
  );
  assert.ok(
    motionMigration.includes(
      "revoke insert, update, delete on public.motion_clip_assets from anon, authenticated"
    )
  );
  assert.ok(controller.includes("extractMotionClip"));
  assert.ok(controller.includes('from("motion_clip_assets")'));
  assert.ok(controller.includes("video_url: media.video_url"));
  assert.ok(controller.includes("persistMotionClip(db, job, result.data)"));
  assert.ok(controller.includes("motion_clip_id: motionClip.id"));
});
