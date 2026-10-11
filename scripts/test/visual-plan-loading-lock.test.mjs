import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import ts from "typescript";

const compile = path => ts.transpileModule(readFileSync(new URL("../../src/" + path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function evaluate(path, dependencies) {
  const mod = { exports: {} };
  runInNewContext(compile(path), { module: mod, exports: mod.exports, require(name) {
    if (name in dependencies) return dependencies[name];
    throw new Error("Unexpected import: " + name);
  } });
  return mod.exports;
}
function browser(t) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.test" });
  const previous = { window: globalThis.window, document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(dom.window.document.getElementById("root"));
  t.after(async () => {
    try { await act(async () => root.unmount()); }
    finally {
      dom.window.close();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    }
  });
  return { dom, root };
}
const scene = id => ({ id, scene_number: id === "a" ? 1 : 2, start_time: 0, end_time: 10,
  title: "Scene " + id, visual_direction: "Persisted direction", camera_direction: "Camera",
  movement_direction: "Movement", location: "Room", mood: "Mood", lyric_moment: "",
  transition_style: "Cut", continuity_notes: "Continuity", status: "draft" });

for (const rejectedTable of ["projects", "world_reports", "visual_plan_scenes"]) {
  test("Visual Plan: rejected " + rejectedTable + " read shows error and settles loading", async t => {
    const { root } = browser(t);
    const writes = [];
    const rows = { projects: { world_report_id: "world-a" }, world_reports: { id: "world-a" },
      style_bibles: null, songs: null, visual_plans: { id: "plan-a" }, vision_locks: null, visual_plan_scenes: [] };
    const supabase = { from(table) {
      const query = { select() { return this; }, eq() { return this; }, order() { return this; },
        limit() { return this; }, single() { return this.result(); }, maybeSingle() { return this.result(); },
        result() { return table === rejectedTable ? Promise.reject({ message: "transport rejected: " + table }) :
          Promise.resolve({ data: rows[table], error: null }); },
        then(resolve, reject) { return this.result().then(resolve, reject); },
        insert() { writes.push("insert"); throw new Error("Unexpected write"); },
        update() { writes.push("update"); throw new Error("Unexpected write"); } };
      return query;
    }, rpc() { writes.push("rpc"); throw new Error("Unexpected RPC"); } };
    const format = evaluate("lib/formatCreativeText.ts", {});
    const errors = evaluate("lib/visualPlanErrors.ts", { "./formatCreativeText": format });
    const { useVisualPlan } = evaluate("hooks/useVisualPlan.ts", { react: React,
      "../lib/supabase/client": { supabase }, "../lib/formatCreativeText": format, "../lib/visualPlanErrors": errors });
    let latest;
    function Probe() { latest = useVisualPlan("project-a"); return null; }
    await act(async () => root.render(React.createElement(Probe)));
    assert.equal(latest.loading, false);
    assert.equal(latest.error, "transport rejected: " + rejectedTable);
    assert.deepEqual(writes, []);
  });
}

async function mountPage(t, { count = 1, failSave = false, approved = false } = {}) {
  const { dom, root } = browser(t);
  let savedScenes = Array.from({ length: count }, (_, i) => scene(i === 0 ? "a" : "b"));
  if (approved) savedScenes = savedScenes.map(row => ({ ...row, status: "approved" }));
  const approvals = [], saves = [], inputProps = new Map();
  let notify;
  const Page = evaluate("pages/VisualPlanPage.tsx", { react: React,
    "react/jsx-runtime": { ...jsxRuntime, jsx(type, props, key) {
      if (type === "input") inputProps.set(props.value, props);
      return jsxRuntime.jsx(type, props, key);
    }, jsxs(type, props, key) { return jsxRuntime.jsxs(type, props, key); } },
    "../hooks/useVisualPlan": { useVisualPlan() {
      const [, update] = React.useState(0); notify = () => update(n => n + 1);
      return { world: { status: "completed", confirmed_at: "fixture" }, styleBible: { status: "approved", approved_at: "fixture" },
        song: { analysis_status: "completed", analysis: {} }, plan: { id: "plan-a", title: "Plan", status: approved ? "approved" : "draft" },
        scenes: savedScenes, loading: false, working: false, error: null,
        createPlan: async () => { throw new Error("Unexpected creation"); },
        approvePlan: async () => { approvals.push(savedScenes.map(row => ({ ...row }))); },
        saveScene: async (id, changes) => {
          saves.push({ id, changes });
          if (failSave) throw new Error("save denied");
          savedScenes = savedScenes.map(row => row.id === id ? { ...row, ...changes } : row);
          notify();
        } };
    } } }).default;
  await act(async () => root.render(React.createElement(Page, { projectId: "project-a" })));
  const button = label => Array.from(dom.window.document.querySelectorAll("button")).find(el => el.textContent.trim() === label);
  const edit = async (oldValue, value) => {
    const props = inputProps.get(oldValue); assert.ok(props, "Missing actual rendered input");
    await act(async () => props.onChange({ target: { value } }));
  };
  const save = async index => {
    const buttons = Array.from(dom.window.document.querySelectorAll("button")).filter(el => el.textContent.trim() === "Save Scene Direction");
    await act(async () => buttons[index].click());
  };
  return { dom, approvals, saves, button, edit, save };
}
test("Visual Plan: unsaved direction blocks locking and successful save restores it", async t => {
  const f = await mountPage(t);
  assert.equal(f.button("Lock Visual Plan").disabled, false);
  await f.edit("Scene a", "Edited direction");
  assert.equal(f.button("Lock Visual Plan").disabled, true);
  await act(async () => f.button("Lock Visual Plan").click());
  assert.equal(f.approvals.length, 0);
  assert.match(f.dom.window.document.querySelector('[role="status"]').textContent, /Save each edited scene/);
  await f.save(0);
  assert.equal(f.button("Lock Visual Plan").disabled, false);
  await act(async () => f.button("Lock Visual Plan").click());
  assert.equal(f.approvals.length, 1);
  assert.equal(f.approvals[0][0].title, "Edited direction");
});
test("Visual Plan: failed save keeps edited input and lock disabled", async t => {
  const f = await mountPage(t, { failSave: true });
  await f.edit("Scene a", "Keep this draft"); await f.save(0);
  assert.equal(f.button("Lock Visual Plan").disabled, true);
  assert.equal(f.dom.window.document.querySelector("input").value, "Keep this draft");
  assert.equal(f.approvals.length, 0);
});
test("Visual Plan: saving one scene does not clear another dirty scene", async t => {
  const f = await mountPage(t, { count: 2 });
  await f.edit("Scene a", "Edited a"); await f.edit("Scene b", "Edited b");
  await f.save(0);
  assert.equal(f.button("Lock Visual Plan").disabled, true);
  await f.save(0);
  assert.equal(f.button("Lock Visual Plan").disabled, false);
  assert.equal(f.approvals.length, 0);
});
test("Visual Plan: reverting input restores readiness without save or approval", async t => {
  const f = await mountPage(t);
  await f.edit("Scene a", "Temporary"); await f.edit("Temporary", "Scene a");
  assert.equal(f.button("Lock Visual Plan").disabled, false);
  assert.equal(f.saves.length, 0); assert.equal(f.approvals.length, 0);
});
test("Visual Plan: approved plans remain read-only and expose no approval action", async t => {
  const f = await mountPage(t, { approved: true });
  assert.equal(f.button("Lock Visual Plan"), undefined);
  assert.equal(f.button("Save Scene Direction"), undefined);
  assert.ok(Array.from(f.dom.window.document.querySelectorAll("input,textarea")).every(el => el.disabled));
  assert.equal(f.saves.length, 0); assert.equal(f.approvals.length, 0);
});

test("Visual Plan: successful save normalizes whitespace and permits locking persisted direction", async t => {
  const f = await mountPage(t);
  await f.edit("Scene a", "  Trimmed title  ");
  assert.equal(f.button("Lock Visual Plan").disabled, true);
  await f.save(0);
  assert.equal(f.dom.window.document.querySelector("input").value, "Trimmed title");
  assert.equal(f.button("Lock Visual Plan").disabled, false);
  await act(async () => f.button("Lock Visual Plan").click());
  assert.equal(f.approvals.length, 1);
  assert.equal(f.approvals[0][0].title, "Trimmed title");
});
