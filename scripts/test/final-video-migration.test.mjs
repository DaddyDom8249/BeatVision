import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../../supabase/migrations/20261008160529_link_final_videos_to_generation_jobs.sql", import.meta.url), "utf8");
const controller = readFileSync(new URL("../../supabase/functions/beatvision-generation/index.ts", import.meta.url), "utf8");

test("final video uniqueness is a non-partial index usable by PostgREST onConflict", () => {
  // ON CONFLICT (generation_job_id) cannot infer a partial unique index
  // unless its WHERE predicate is also included in the conflict target.
  assert.match(
    migration,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+final_videos_generation_job_id_uidx\s+on\s+public\.final_videos\s*\(\s*generation_job_id\s*\)\s*;/i,
  );
  assert.match(controller, /onConflict:\s*["']generation_job_id["']/);
});

test("completed videos are not deleted by cascading generation job deletion", () => {
  assert.match(migration, /references\s+public\.generation_jobs\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/i);
});
