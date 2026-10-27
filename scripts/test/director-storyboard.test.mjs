import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React, { act } from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as direction from "../../src/lib/guidedShotRepair.ts";

const source = readFileSync(new URL("../../src/components/plan/DirectorStoryboard.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}}).outputText;
const mod = { exports: {} };
runInNewContext(code, { module: mod, exports: mod.exports, require(name) {
  if (name === "react") return React;
  if (name === "react/jsx-runtime") return jsx;
  if (name === "../../lib/guidedShotRepair") return direction;
  throw new Error("Unexpected dependency: " + name);
} });
const { directorDirectionPatch, default: DirectorStoryboard } = mod.exports;

const makeScene = (number) => ({
  id: "scene-" + number, visual_plan_id: "plan-1", project_id: "project", world_report_id: "world",
  style_bible_id: "style", song_id: "song", scene_number: number, section_index: number - 1,
  start_time: (number - 1) * 5, end_time: number * 5, title: "Song moment " + number,
  visual_direction: "A rain-soaked figure stands beside a streetlight.",
  movement_direction: JSON.stringify({ actor: "The figure slowly reaches for the phone.", camera: "Camera holds still." }),
  camera_direction: "Camera holds still.", location: "Rainy street", mood: "Dread",
  lyric_moment: "The last call never came.", transition_style: "Cut", continuity_notes: "Keep the same wardrobe.",
  status: "draft", updated_at: "v1",
});

test("unchanged scene is not rewritten and one plain-language visual edit preserves all other decisions", () => {
  const scene = makeScene(1);
  const draft = { visual: scene.visual_direction, actor: direction.readSceneDirections(scene).actor,
    camera: direction.readSceneDirections(scene).camera, mood: scene.mood };
  assert.equal(Object.keys(directorDirectionPatch(scene, draft)).length, 0);
  const changed = { ...draft, visual: "The figure watches the empty street from under the canopy." };
  const patch = JSON.parse(JSON.stringify(directorDirectionPatch(scene, changed)));
  assert.deepEqual(patch, { visual_direction: changed.visual });
  assert.equal(scene.visual_direction, draft.visual);
  for (const protectedField of ["start_time", "end_time", "lyric_moment", "location", "transition_style", "continuity_notes", "status"])
    assert.equal(Object.hasOwn(patch, protectedField), false, protectedField + " must not be edited");
});

test("actor correction preserves existing camera and rejects ambiguous motion without any save", () => {
  const scene = makeScene(1);
  const original = direction.readSceneDirections(scene);
  const base = { visual: scene.visual_direction, ...original, mood: scene.mood };
  const patch = JSON.parse(JSON.stringify(directorDirectionPatch(scene, { ...base, actor: "The figure lifts the phone to their ear." })));
  assert.deepEqual(Object.keys(patch), ["movement_direction"]);
  assert.deepEqual(JSON.parse(patch.movement_direction), {
    actor: "The figure lifts the phone to their ear.", camera: original.camera,
  });
  assert.throws(() => directorDirectionPatch(scene, { ...base, actor: "The figure walks or jumps." }), /Choose one action/);
  assert.throws(() => directorDirectionPatch(scene, { ...base, camera: "Zoom then tilt" }), /Choose one action/);
});

async function fixture(t, locked = false) {
  const dom = new JSDOM("<div id=\"root\"></div>", { url: "https://fixture.test" });
  const prior = { window: globalThis.window, document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.querySelector("#root")), saves = [];
  await act(async () => root.render(React.createElement(DirectorStoryboard, {
    scenes: [makeScene(1), makeScene(2)], locked, working: false,
    onSave: async (id, changes) => saves.push({ id, changes }),
  })));
  const button = label => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label);
  const click = async item => {
    assert.ok(item, "button must exist");
    await act(async () => item.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
  };
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, prior);
  });
  return { button, click, saves };
}

test("beginner director sees scene-by-scene lyrics and can navigate without any model or render call", async t => {
  const app = await fixture(t);
  assert.match(document.body.textContent, /scene by scene/i);
  assert.match(document.body.textContent, /The last call never came/);
  assert.match(document.body.textContent, /Scene 1 of 2/);
  assert.equal(app.button("Previous").disabled, true);
  assert.equal(app.button("Next").disabled, false);
  await app.click(app.button("Next"));
  assert.match(document.body.textContent, /Scene 2 of 2/);
  assert.equal(app.saves.length, 0);
});

test("locked plans allow direction review but not editing or modifying approved work", async t => {
  const app = await fixture(t, true);
  assert.match(document.body.textContent, /locked this plan/);
  assert.equal(app.button("Change this scene"), undefined);
  assert.equal(app.saves.length, 0);
});

test("no direct media generation, AI provider, or auto-approval operation in the storyboard", () => {
  assert.doesNotMatch(source, /supabase\.|functions\.invoke|approvePlan\(|enqueue|generateMotion/i);
  assert.match(source, /await onSave\(scene\.id, patch\)/);
});
