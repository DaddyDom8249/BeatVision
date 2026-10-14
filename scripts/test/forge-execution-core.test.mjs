import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";
const source = readFileSync(new URL("../../src/lib/beatvision/forge/commands.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(js, { exports });
const run = exports.executeForgeCommand;
const job = { id: "j1", project_id: "p1", job_type: "scene_motion", status: "failed", error: "provider unavailable" };
test("rejects unknown commands and mismatched ownership", () => {
  assert.throws(() => run({ command: "delete_assets", projectId: "p1" }));
  assert.throws(() => run({ command: "inspect_job", projectId: "p2", job }));
});
test("reports provider failures without executing requests", () => {
  const result = run({ command: "explain_failure", projectId: "p1", job });
  assert.equal(result.reason, "provider unavailable");
  assert.equal(result.nextAction, "inspect_provider_and_eligibility");
});
test("blocks motion without approved asset URLs", () => {
  const result = run({ command: "validate_stage", projectId: "p1", stage: "motion", approved: true, assets: [{ id: "a1", approved: true }] });
  assert.equal(result.ok, false);
});
test("validates supplied approved motion prerequisites", () => {
  const result = run({ command: "validate_stage", projectId: "p1", stage: "motion", approved: true, assets: [{ id: "a1", approved: true, url: "https://example.invalid/clip.mp4" }] });
  assert.equal(result.ok, true);
});
test("never automatically retries jobs", () => {
  const result = run({ command: "plan_retry", projectId: "p1", job });
  assert.equal(result.requiresApproval, true);
  assert.equal(result.nextAction, "review_retry_in_existing_controller");
  assert.equal(run({ command: "plan_retry", projectId: "p1", job: { ...job, status: "completed" } }).ok, false);
});
