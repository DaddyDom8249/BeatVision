import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../../", import.meta.url);
const hook = fs.readFileSync(new URL("src/hooks/useStyleStudio.ts", root), "utf8");
const page = fs.readFileSync(new URL("src/pages/StylePage.tsx", root), "utf8");

test("world version conflict blocks invalid draft seeding before ensureWorldDrafts", () => {
  const checkpoint = hook.indexOf("currentStyleBible.world_report_id !== currentWorld.id");
  const seeding = hook.indexOf("await ensureWorldDrafts(currentWorld, projectId, currentStyleBible)");
  assert.ok(checkpoint > 0 && seeding > checkpoint);
  assert.match(hook.slice(checkpoint, seeding), /setLineageConflict/);
  assert.match(hook.slice(checkpoint, seeding), /setLoading\(false\);\s*return;/);
});
test("World reconciliation requires explicit creator confirmation and approved prior World", () => {
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /restoreApprovedStyleWorld/);
  assert.match(hook, /styleBible\.status !== "approved"/);
  assert.match(hook, /prior\.data\?\.status !== "completed"/);
  assert.match(hook, /!prior\.data\.confirmed_at/);
});
test("World pointer update is owner scoped with optimistic concurrency", () => {
  assert.match(hook, /\.update\(\{ world_report_id: prior\.data\.id \}\)/);
  assert.match(hook, /\.eq\("owner_id", ownerId\)/);
  assert.match(hook, /\.eq\("world_report_id", lineageConflict\.activeWorldId\)/);
  assert.match(hook, /if \(!switched\.data\)/);
});
test("approved children and original World reports are never silently rewritten", () => {
  const fn = hook.slice(hook.indexOf("const restoreApprovedStyleWorld ="), hook.indexOf("const createStyleBible ="));
  assert.doesNotMatch(fn, /\.from\("style_bibles"\)\s*\.update|\.from\("characters"\)\s*\.update|\.from\("environments"\)\s*\.update/);
  assert.match(page, /Your approved Style Bible is preserved/);
  assert.match(page, /Your newer World revision stays saved/);
});
