import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import React, { act } from "react";
import * as jsx from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

function compile(path, dependencies, window) {
  const source = readFileSync(new URL("../../" + path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const mod = { exports: {} };
  runInNewContext(code, {
    module: mod, exports: mod.exports, window, URL, URLSearchParams,
    require(name) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsx;
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error("Unexpected test dependency: " + name);
    },
  });
  return mod.exports.default;
}

async function fixture(t, { url = "https://fixture.test/projects/project-1/visual-plan?plan=saved-plan", rejectAuth = false } = {}) {
  const dom = new JSDOM("<div id='root'></div>", { url });
  const previous = { window: globalThis.window, document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const supabase = { auth: { getUser: async () => {
    if (rejectAuth) throw new Error("Fixture auth transport failure");
    return { data: { user: { email: "a-long-synthetic-creator-email@fixture.test" } } };
  } } };
  const Header = compile("src/components/navigation/StudioHeader.tsx", {
    "../../lib/supabase/client": { supabase },
    "./AppearanceSettings": { default: () => null },
  }, dom.window);
  const root = createRoot(dom.window.document.getElementById("root"));
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
  });
  return {
    document: dom.window.document, window: dom.window, Header,
    compile: (path, dependencies) => compile(path, {
      "../components/navigation/StudioHeader": { default: Header }, ...dependencies,
    }, dom.window),
    render: async (Component, props) => {
      await act(async () => root.render(React.createElement(Component, props)));
    },
    click: async (button) => {
      assert.ok(button);
      await act(async () => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    },
  };
}

for (const [name, meter, expected] of [
  ["null", null, "Unavailable"], ["missing", undefined, "Unavailable"],
  ["empty", "", "Unavailable"], ["derived", "3/4", "3/4"],
]) {
  test("song meter is truthful when " + name, async (t) => {
    const f = await fixture(t);
    const Page = f.compile("src/pages/SongPage.tsx", {
      "../lib/supabase/client": { supabase: {} },
      "../hooks/useProject": { useProject: () => ({ project: { id: "project-1", title: "Fixture track" }, loading: false }) },
      "../hooks/useSong": { useSong: () => ({ loading: false, song: {
        id: "song-1", title: "Fixture track", artist: "Fixture artist", analysis_status: "completed",
        analysis: { duration_seconds: 60, time_signature: meter, sections: [] },
      } }) },
      "../lib/musicAnalysis": { analyzeAudioLocally: () => { throw new Error("No analysis call expected"); } },
      "../lib/errorDetails": { formatFailure: () => "Fixture error" },
    });
    await f.render(Page, { projectId: "project-1" });
    const card = [...f.document.querySelectorAll(".analysis-metric-card")]
      .find(node => node.querySelector(".metric-label")?.textContent === "Time Signature");
    assert.equal(card?.querySelector(".metric-value")?.textContent, expected);
  });
}

for (const explicit of [false, true]) {
  test("pipeline keeps the " + (explicit ? "loaded" : "requested") + " plan revision", async (t) => {
    const f = await fixture(t);
    const paths = [];
    const selected = explicit ? "loaded-approved-plan" : "saved-plan";
    await f.render(f.Header, { projectId: "project-1", activeStage: "visual-plan",
      planId: explicit ? selected : undefined, onNavigate: path => paths.push(path) });
    const buttons = [...f.document.querySelectorAll(".pipeline-step")];
    for (const button of buttons) await f.click(button);
    assert.deepEqual(paths, [
      "/projects/project-1/song", "/projects/project-1/world", "/projects/project-1/style",
      ...["visual-plan", "scenes", "production"].map(stage => "/projects/project-1/" + stage + "?plan=" + selected),
    ]);
    assert.equal(f.document.querySelector('[aria-current="step"] .step-label').textContent, "Plan");
  });
}

test("header auth failure leaves a usable sign-in control", async (t) => {
  const f = await fixture(t, { rejectAuth: true });
  const paths = [];
  await f.render(f.Header, { onNavigate: path => paths.push(path) });
  await f.click(f.document.querySelector(".studio-auth-btn"));
  assert.deepEqual(paths, ["/auth"]);
});

for (const approved of [false, true]) {
  test("Visual Plan retains " + (approved ? "approved revision controls" : "editable scene timing"), async (t) => {
    const f = await fixture(t);
    let revisions = 0;
    const plan = { id: "saved-plan", title: "Fixture plan", revision_number: 2, status: approved ? "approved" : "draft" };
    const Page = f.compile("src/pages/VisualPlanPage.tsx", {
      "../hooks/useVisualPlan": { useVisualPlan: () => ({
        world: { status: "completed", confirmed_at: "fixture" },
        styleBible: { status: "approved", approved_at: "fixture" },
        song: { analysis_status: "completed", analysis: { sections: [] } },
        plan, planHistory: [plan, { id: "older-plan", status: "approved", revision_number: 1 }],
        scenes: [{ id: "scene-1", scene_number: 1, start_time: 0, end_time: 60,
          title: "Scene", location: "Room", mood: "Calm", lyric_moment: "Intro", visual_direction: "Wide shot",
          camera_direction: "Still", movement_direction: "Slow", transition_style: "Cut", continuity_notes: "Same room",
          status: approved ? "approved" : "draft" }],
        loading: false, working: false, error: null,
        revisePlan: async () => { revisions++; },
      }) },
    });
    await f.render(Page, { projectId: "project-1" });
    const times = [...f.document.querySelectorAll('input[type="number"]')];
    assert.equal(times.length, 2);
    assert.deepEqual(times.map(input => input.value), ["0", "60"]);
    assert.ok(times.every(input => input.disabled === approved));
    assert.equal(f.document.querySelectorAll('[aria-label="Plan revisions"] a').length, 2);
    if (approved) {
      await f.click([...f.document.querySelectorAll("button")].find(button => button.textContent === "Create Editable Revision"));
      assert.equal(revisions, 1);
      assert.ok(f.document.querySelector('a[href="/projects/project-1/scenes?plan=saved-plan"]'));
    }
  });
}

test("draft scene controls explicitly contrast against their background", () => {
  const css = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
  const dom = new JSDOM('<style></style><div class="visual-plan-grid"><input><textarea></textarea></div>');
  dom.window.document.querySelector("style").textContent = css;
  const rules = [...dom.window.document.styleSheets[0].cssRules].filter(rule => rule.selectorText);
  const variables = rules.find(rule => rule.selectorText === ":root").style;
  const resolve = value => value.startsWith("var(") ? variables.getPropertyValue(value.slice(4, -1)).trim() : value;
  const luminance = hex => {
    assert.match(hex, /^#[0-9a-f]{6}$/i);
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const control of dom.window.document.querySelectorAll("input, textarea")) {
    let background = "", foreground = "";
    for (const rule of rules) if (control.matches(rule.selectorText)) {
      background = rule.style.getPropertyValue("background") || background;
      foreground = rule.style.getPropertyValue("color") || foreground;
    }
    const values = [luminance(resolve(background)), luminance(resolve(foreground))].sort((a, b) => b - a);
    assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5);
  }
  dom.window.close();
});
