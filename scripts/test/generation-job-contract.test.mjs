import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  new URL("../../supabase/migrations/20261006000000_freeze_generation_job_types.sql", import.meta.url),
  "utf8",
);

assert.match(
  migration,
  /check\s*\(job_type\s+in\s*\('scene_image',\s*'scene_motion'\)\)/i,
  "canonical generation job constraint must allow only scene_image and scene_motion",
);
assert.doesNotMatch(
  migration,
  /drop constraint if exists generation_jobs_job_type_check/i,
  "canonical freeze is additive and preserves the legacy constraint",
);
assert.match(
  migration,
  /assembly remains locked/i,
  "assembly lock must be explicit",
);

console.log("PASS: canonical generation job types are frozen to scene_image + scene_motion.");
