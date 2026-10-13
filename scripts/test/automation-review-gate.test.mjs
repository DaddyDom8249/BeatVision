import test from "node:test";
import assert from "node:assert/strict";
import { evaluateGate, reportMarkdown } from "../automation/review-gate-core.mjs";
const A = "a".repeat(40), B = "b".repeat(40);
const example = () => ({
  pr: { state: "open", draft: false, mergeable: true, head: { sha: A }, base: { sha: B } },
  reviewThreads: [],
  production: { commit_sha: B, observed_at: "2026-10-13T16:00:00.000Z" },
  comparison: { status: "ahead", behind_by: 0 },
  now: new Date("2026-10-13T17:00:00.000Z"),
  files: [{ filename: "src/app/App.tsx" }]
});
test("clean preflight never approves release", () => {
  const r = evaluateGate(example());
  assert.equal(r.status, "PREFLIGHT_PASS_NOT_RELEASE_APPROVAL");
  assert.equal(r.release_authorized, false);
  assert.equal(r.changed_file_count, 1);
});
test("unresolved current review blocks", () => {
  const d=example(); d.reviewThreads=[{isResolved:false,isOutdated:false}];
  assert.equal(evaluateGate(d).status, "BLOCKED_FOR_RELEASE");
});
test("resolved and outdated reviews are not blockers", () => {
  const d=example(); d.reviewThreads=[{isResolved:true,isOutdated:false},{isResolved:false,isOutdated:true}];
  assert.equal(evaluateGate(d).status, "PREFLIGHT_PASS_NOT_RELEASE_APPROVAL");
});
test("diverged lineage blocks", () => {
  const d=example(); d.comparison={status:"diverged",behind_by:5};
  assert.match(evaluateGate(d).blockers.join(" "),/production-source/);
});
test("stale evidence blocks", () => {
  const d=example(); d.now=new Date("2026-10-18T17:00:00Z");
  assert.match(evaluateGate(d).blockers.join(" "),/older than 72 hours/);
});
test("unknown thread state blocks", () => {
  const d=example(); d.reviewThreads=undefined;
  assert.match(evaluateGate(d).blockers.join(" "),/Review thread/);
});
test("draft, conflicting PRs block", () => {
  const d=example(); d.pr.draft=true; d.pr.mergeable=false;
  assert.equal(evaluateGate(d).status,"BLOCKED_FOR_RELEASE");
});
test("markdown reports limits", () => {
  const m=reportMarkdown(evaluateGate(example()),81);
  assert.match(m,/Still unverified/);
  assert.match(m,/not deployment approval/i);
});
