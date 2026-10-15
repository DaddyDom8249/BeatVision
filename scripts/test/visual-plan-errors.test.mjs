import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const hookPath = fileURLToPath(new URL("../../src/hooks/useVisualPlan.ts", import.meta.url));

function blockedPlan(error) {
  const state = [
    { id: "world", status: "completed", confirmed_at: "locked" },
    { id: "style", status: "approved", approved_at: "locked" },
    { id: "song", analysis_status: "completed", analysis: { duration_seconds: 120 } },
    null, null, [], true, false, null,
  ];
  let cursor = 0;
  const calls = [];
  const react = {
    useState() { const index = cursor++; return [state[index], value => { state[index] = value; }]; },
    useCallback(callback) { return callback; },
    useEffect() {},
  };
  const supabase = {
    async rpc(name, args) { calls.push({ name, args }); return { data: null, error }; },
    from() { throw new Error("A blocked Vision Lock must not write a plan or scenes."); },
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
  return { hook: load(hookPath).useVisualPlan("project"), state, calls };
}

function approvedPlanRevision() {
  const state = [null, null, null, { id: "approved-plan", status: "approved" }, null, [], false, false, null, []];
  let cursor = 0;
  const react = {
    useState() { const index = cursor++; return [state[index], value => { state[index] = value; }]; },
    useCallback(callback) { return callback; },
    useEffect() {},
  };
  const window = {
    location: { pathname: "/projects/project/visual-plan", search: "?plan=approved-plan", hash: "" },
    history: { replaceState(_state, _title, url) {
      const parsed = new URL(url, "https://fixture.test");
      window.location.pathname = parsed.pathname;
      window.location.search = parsed.search;
      window.location.hash = parsed.hash;
    } },
  };
  const supabase = {
    async rpc(name, args) {
      assert.equal(name, "create_visual_plan_revision");
      assert.equal(args.p_plan_id, "approved-plan");
      return { data: { id: "draft-plan", status: "draft" }, error: null };
    },
    from(table) {
      assert.equal(table, "projects");
      assert.equal(window.location.search, "?plan=draft-plan");
      throw new Error("LOAD_REACHED_WITH_NEW_REVISION_SELECTED");
    },
  };
  function load(path) {
    const javascript = ts.transpileModule(readFileSync(path, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    runInNewContext(javascript, { module, exports: module.exports, window, URLSearchParams, require(specifier) {
      if (specifier === "react") return react;
      if (specifier.endsWith("/supabase/client")) return { supabase };
      return load(resolve(dirname(path), specifier + ".ts"));
    } });
    return module.exports;
  }
  return { hook: load(hookPath).useVisualPlan("project"), window };
}

test("a real PostgREST environment approval failure tells the artist what to approve", async () => {
  const failure = { message: "VISION_LOCK_ENVIRONMENTS_NOT_APPROVED", code: "23514" };
  const { hook, state, calls } = blockedPlan(failure);
  await assert.rejects(hook.createPlan(), error => error === failure);
  assert.match(state[8], /approve.*environment/i);
  assert.match(state[8], /Style Bible/);
  assert.equal(state[7], false);
  assert.equal(state[3], null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "create_visual_plan");
  assert.equal(calls[0].args.p_project_id, "project");
});

test("unknown structured database failures preserve their message", async () => {
  const failure = { message: "Permission denied for visual_plans", code: "42501" };
  const { hook, state } = blockedPlan(failure);
  await assert.rejects(hook.createPlan(), error => error === failure);
  assert.equal(state[8], failure.message);
  assert.equal(state[7], false);
});

test("creating a revision selects the returned draft before reloading", async () => {
  const { hook, window } = approvedPlanRevision();
  await assert.rejects(hook.revisePlan(), /LOAD_REACHED_WITH_NEW_REVISION_SELECTED/);
  assert.equal(window.location.search, "?plan=draft-plan");
});
