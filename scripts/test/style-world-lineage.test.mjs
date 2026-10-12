import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const hook = readFileSync(new URL("../../src/hooks/useStyleStudio.ts", import.meta.url), "utf8");
const style = readFileSync(new URL("../../src/pages/StylePage.tsx", import.meta.url), "utf8");

test("revised World cannot insert drafts into a previously approved Style Bible", async () => {
  const start = hook.indexOf("  const load = useCallback(async () => {");
  const endMarker = "  }, [projectId]);";
  const end = hook.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, "exercise the real load callback");

  const compiled = ts.transpileModule(
    hook.slice(start, end + endMarker.length) + "\nreturn load;",
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;

  const reads = [];
  let writes = 0;
  const currentWorld = { id: "new-world", status: "completed", confirmed_at: "2026-10-12" };
  const approvedStyle = { id: "approved-style", world_report_id: "old-world", status: "approved" };
  const rows = {
    projects: { data: { world_report_id: currentWorld.id }, error: null },
    world_reports: { data: currentWorld, error: null },
    style_bibles: { data: approvedStyle, error: null },
  };
  const supabase = {
    from(table) {
      reads.push(table);
      assert.ok(Object.hasOwn(rows, table), "lineage mismatch must stop before child-asset reads");
      return {
        select() { return this; },
        eq(_field, id) { assert.ok(id); return this; },
        single: async () => rows[table],
        maybeSingle: async () => rows[table],
        insert() { writes++; throw new Error("No insert is permitted on read-only mismatch"); },
        update() { writes++; throw new Error("No update is permitted on read-only mismatch"); },
      };
    },
  };
  const states = {};
  const setters = ["setLoading", "setError", "setWorld", "setStyleBible",
    "setCharacters", "setCharacterAssets", "setEnvironments", "setEnvironmentAssets"];
  const factory = new Function(
    "useCallback", "supabase", "projectId", "hasStartedLoad", "styleFields",
    ...setters, compiled,
  );
  const handlers = setters.map(name => value => { states[name.slice(3).toLowerCase()] = value; });
  const load = factory(fn => fn, supabase, "ghast", { current: false },
    "id,world_report_id,status", ...handlers);
  await load();

  assert.deepEqual(reads, ["projects", "world_reports", "style_bibles"]);
  assert.equal(writes, 0);
  assert.equal(states.loading, false);
  assert.equal(states.world.id, "new-world");
  assert.equal(states.stylebible.id, "approved-style", "never discard the old approved Style Bible");
  assert.deepEqual(states.characters, []);
  assert.deepEqual(states.environments, []);
  assert.match(states.error, /active World was revised/);
});

function renderMismatch(status) {
  const source = ts.transpileModule(style, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const hookResult = {
    world: { id: "new-world", status: "completed", confirmed_at: "2026-10-12" },
    styleBible: { id: "old-style", world_report_id: "old-world", status },
    characters: [], characterAssets: [], environments: [], environmentAssets: [],
    loading: false, working: false, error: "Old and new creative lineages differ",
    locked: status === "approved",
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const deps = name => {
    if (name === "react") return { useState: value => [value, () => {}], useEffect() {} };
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "../hooks/useStyleStudio") return { useStyleStudio: () => hookResult };
    if (name === "../lib/formatCreativeText") return { formatCreativeLines: () => [] };
    if (name.includes("/style/CharacterEditor") || name.includes("/style/EnvironmentEditor")) {
      return { default: () => null };
    }
    throw new Error("Unexpected dependency: " + name);
  };
  const m = { exports: {} };
  runInNewContext(source, { module: m, exports: m.exports, require: deps });
  return m.exports.default({ projectId: "ghast" });
}

function collect(node) {
  if (Array.isArray(node)) return node.flatMap(collect);
  if (!node || typeof node !== "object") return [];
  return [node, ...collect(node.props?.children)];
}

test("approved old lineage shows read-only recovery to existing production", () => {
  const nodes = collect(renderMismatch("approved"));
  const anchors = nodes.filter(node => node.type === "a").map(node => node.props.href);
  assert.ok(anchors.includes("/projects/ghast/world"));
  assert.ok(anchors.includes("/projects/ghast/production"));
  assert.ok(!anchors.includes("/projects/ghast/visual-plan"),
    "do not misrepresent an old approval as a new-World approval");
  assert.equal(nodes.filter(node => node.type === "button").length, 0,
    "mismatched creative versions cannot enable save, create, approve or generate controls");
  assert.ok(nodes.some(node => node.props.role === "alert"));
});

test("unapproved old lineage cannot shortcut to production", () => {
  const nodes = collect(renderMismatch("draft"));
  const anchors = nodes.filter(node => node.type === "a").map(node => node.props.href);
  assert.ok(anchors.includes("/projects/ghast/world"));
  assert.ok(!anchors.includes("/projects/ghast/production"));
  assert.equal(nodes.filter(node => node.type === "button").length, 0);
});
