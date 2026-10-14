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
test("Studio shows disabled Wan new submission and keeps existing status polling",()=>{
  assert.match(studio,/Wan AI preview unavailable/);
  assert.match(studio,/const wanPreviewEligibilityVerified = false/);
  assert.match(studio,/disabled=\{!wanPreviewEligibilityVerified/);
  assert.match(studio,/beatvision-free-motion-pilot/);
  assert.match(studio,/does not cover the full scene/);
  assert.match(studio,/freePilotUrl/);
});

test("queued ZeroGPU work is polled, never resubmitted by timeout",()=>{
  assert.match(edge,/action==="poll"/);
  assert.match(edge,/\/v1\/video\/wan-zero\/jobs\//);
  assert.match(edge,/return respond\(req,\{ok:true,status:"submitted"/);
  assert.match(studio,/status === "processing"/);
  assert.match(studio,/freePilotJob\?\.token/);
  assert.match(studio,/Preview queued \(no resubmission\)/);
});
test("poll job tickets are HMAC scoped to owner project and scene",()=>{
  assert.match(edge,/crypto\.subtle\.sign\("HMAC"/);
  assert.match(edge,/crypto\.subtle\.verify\("HMAC"/);
  assert.match(edge,/ticket\.p!==projectId\|\|ticket\.s!==sceneId\|\|ticket\.u!==ownerId/);
  assert.match(edge,/ticket\.x<Date\.now\(\)/);
});
test("provider MP4 is unapproved and never written to database",()=>{
  assert.match(edge,/clip\.generation_type!=="GENERATIVE_VIDEO"/);
  assert.match(edge,/safeURL\(clip\.video_url\)/);
  assert.doesNotMatch(edge,/\.insert\(|\.upsert\(|\.update\(/);
});
