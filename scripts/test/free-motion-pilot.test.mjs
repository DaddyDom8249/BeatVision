import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const root = new URL("../../", import.meta.url);
const edge=fs.readFileSync(new URL("supabase/functions/beatvision-free-motion-pilot/index.ts",root),"utf8");
const studio=fs.readFileSync(new URL("src/pages/ProductionWorkspacePage.tsx",root),"utf8");
test("free pilot enforces caller ownership before service-role reads",()=>{
  assert.match(edge,/access\.auth\.getUser/);
  assert.match(edge,/\.eq\("owner_id",identity\.data\.user\.id\)/);
});
test("pilot requires approved image, signed storage, and strict model",()=>{
  assert.match(edge,/\.eq\("approved",true\)/);
  assert.match(edge,/createSignedUrl/);
  assert.match(edge,/requested_model:"wan2\.2-zerogpu"/);
});
test("pilot never persists or approves motion automatically",()=>{
  assert.doesNotMatch(edge,/\.insert\(|\.upsert\(|\.update\(/);
  assert.match(edge,/approved:false/);
});
test("pilot truncates preview without claiming scene length",()=>{
  assert.match(edge,/Math\.min\(MAX_SECONDS,originalDuration\)/);
  assert.match(edge,/original_scene_duration_seconds:originalDuration/);
});
test("Studio includes real-motion pilot with explicit limit",()=>{
  assert.match(studio,/Generate free 3-second AI movement/);
  assert.match(studio,/beatvision-free-motion-pilot/);
  assert.match(studio,/does not cover the full scene/);
  assert.match(studio,/freePilotUrl/);
});
