import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("the actual plan builder retains Ghast-shaped structured World directions", async () => {
  const world = {
    id: "world", status: "completed", confirmed_at: "locked",
    environments: [
      { setting: "dimly lit interior", description: "shadowy rooms, flickering lights" },
      { setting: "abstract mindscape", description: "floating geometric shapes" },
    ],
    emotional_arc: [{ stage: "vulnerability", description: "raw admission of loss and doubt" }],
    mood: ["melancholic", "intense"], atmosphere: "oppressive, introspective",
    cinematography: {
      movements: ["slow pan", "dolly in"], camera_types: ["handheld", "static tripod"],
      shot_lengths: "medium to long", focus_techniques: ["shallow depth of field", "rack focus"],
    },
    movement: { camera_behavior: "steady, deliberate" },
    continuity_rules: [{ rule: "Preserve the deep blue palette" }],
  };
  const state = [world, { id: "style", status: "approved", approved_at: "locked" },
    { id: "song", analysis_status: "completed", analysis: { duration_seconds: 120 } },
    null, null, [], true, false, null];
  let cursor = 0;
  const writes = {};
  const react = {
    useState() { const index = cursor++; return [state[index], value => { state[index] = value; }]; },
    useCallback(callback) { return callback; }, useEffect() {},
  };
  const supabase = {
    async rpc() { return { data: { id: "lock" }, error: null }; },
    from(table) { return { insert(input) {
      writes[table] = input;
      return { select() {
        return table === "visual_plans"
          ? { async single() { return { data: { ...input, id: "plan" }, error: null }; } }
          : Promise.resolve({ data: input, error: null });
      } };
    } }; },
  };
  function load(path) {
    const javascript = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    runInNewContext(javascript, { module, exports: module.exports, require(specifier) {
      if (specifier === "react") return react;
      if (specifier.endsWith("/supabase/client")) return { supabase };
      return load(resolve(dirname(path), specifier + ".ts"));
    } });
    return module.exports;
  }
  const hook = load(fileURLToPath(new URL("../../src/hooks/useVisualPlan.ts", import.meta.url))).useVisualPlan("project");
  await hook.createPlan();
  const scene = writes.visual_plan_scenes[0];
  assert.match(scene.location, /dimly lit interior/);
  assert.match(scene.location, /abstract mindscape/);
  assert.match(scene.camera_direction, /slow pan/);
  assert.match(scene.camera_direction, /handheld/);
  assert.match(scene.camera_direction, /rack focus/);
  assert.match(scene.continuity_notes, /deep blue palette/);
  assert.match(writes.visual_plans.creative_thesis, /raw admission of loss/);
  assert.equal(writes.visual_plans.vision_lock_id, "lock");
  assert.equal(state[8], null);
});
