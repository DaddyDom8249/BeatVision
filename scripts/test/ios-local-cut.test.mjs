import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../src/pages/LocalCutPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../src/app/App.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../../src/pages/ProductionWorkspacePage.tsx", import.meta.url), "utf8");
const generation = readFileSync(new URL("../../supabase/functions/beatvision-generation/index.ts", import.meta.url), "utf8");

test("Local Cut is routed and linked from production", () => {
  assert.match(app, /local-cut/);
  assert.match(app, /<LocalCutPage projectId=/);
  assert.match(workspace, /Open Local Cut/);
});
test("Local Cut reads approved plans and scenes without queueing provider jobs", () => {
  assert.match(page, /\.eq\("status", "approved"\)/);
  assert.match(page, /\.eq\("project_id", projectId\)/);
  assert.doesNotMatch(page, /supabase\.rpc\(|supabase\.functions\.invoke\(|\.insert\(|\.update\(|\.upload\(/);
  assert.match(page, /revokeObjectURL/);
});
test("Local Cut refuses invalid local export and calls no paid provider", () => {
  assert.match(page, /canvas\.captureStream/);
  assert.match(page, /new MediaRecorder/);
  assert.match(page, /decoded\.duration - duration/);
  assert.match(page, /gap or overlap/);
  assert.match(page, /video clips are preview-only/i);
  assert.doesNotMatch(page, /fetch\(|apiKey|Bearer|shotstack/i);
});
test("Provider cost guard remains enforced for remote image and assembly", () => {
  assert.match(generation, /PROVIDER_COST_UNVERIFIED: New image and assembly submissions are unavailable/);
});
