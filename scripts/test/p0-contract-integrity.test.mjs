import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("AuthPage clears saving state in finally", () => {
  const source = fs.readFileSync("src/pages/AuthPage.tsx", "utf8");
  assert.match(source, /try\s*\{[\s\S]*signInWithPassword/);
  assert.match(source, /finally\s*\{\s*setSaving\(false\);\s*\}/);
});

test("Visual Plan uses the canonical Vision Lock and atomic creation RPCs", () => {
  const source = fs.readFileSync("src/hooks/useVisualPlan.ts", "utf8");
  assert.match(source, /supabase\.rpc\("create_vision_lock"/);
  assert.match(source, /supabase\.rpc\("create_visual_plan"/);
  assert.doesNotMatch(source, /supabase\.from\("visual_plans"\)\.insert/);
  assert.doesNotMatch(source, /supabase\.from\("visual_plan_scenes"\)\.insert/);
});
