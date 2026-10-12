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

const read = path => readFileSync(new URL("../../src/" + path, import.meta.url), "utf8");
const compile = path => ts.transpileModule(read(path), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;

function browser(t, route = "/") {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.test" + route });
  const previous = { window: globalThis.window, document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
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

function evaluate(path, requireMock, globals = {}) {
  const mod = { exports: {} };
  runInNewContext(compile(path), {
    module: mod, exports: mod.exports, require: requireMock, ...globals,
  });
  return mod.exports;
}

async function mountHook(t, kind, initialId = "project-a") {
  const { root } = browser(t);
  const requests = [], signatures = [], writes = [];
  const supabase = {
    from(table) {
      const filters = {};
      const query = {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        single() { return this.result(); },
        maybeSingle() { return this.result(); },
        result() {
          return new Promise((resolve, reject) => requests.push({ table, filters, resolve, reject }));
        },
        update() { writes.push("update"); throw new Error("Unexpected write"); },
        insert() { writes.push("insert"); throw new Error("Unexpected write"); },
      };
      return query;
    },
    storage: { from(bucket) { return {
      createSignedUrl(path) {
        return new Promise((resolve, reject) => signatures.push({ bucket, path, resolve, reject }));
      },
    }; } },
  };
  const format = evaluate("lib/formatCreativeText.ts", () => { throw new Error("Unexpected format import"); });
  const mod = evaluate("hooks/" + (kind === "song" ? "useSong.ts" : "useProject.ts"), name => {
    if (name === "react") return React;
    if (name === "../lib/supabase/client") return { supabase };
    if (name === "../lib/formatCreativeText") return format;
    throw new Error("Unexpected hook import: " + name);
  });
  const useHook = kind === "song" ? mod.useSong : mod.useProject;
  let latest;
  function Probe({ id }) { latest = useHook(id); return null; }
  const render = async id => { await act(async () => root.render(React.createElement(Probe, { id }))); };
  const row = (id, title = id, audio = null) => kind === "song"
    ? { id: "song-" + id, project_id: id, title, audio_path: audio }
    : { id, owner_id: "fixture-owner", title };
  const respond = async (index, data, error = null) => {
    assert.ok(requests[index], "Missing request " + index);
    await act(async () => requests[index].resolve({ data, error }));
  };
  await render(initialId);
  return { state: () => latest, data: () => latest[kind], requests, signatures, writes,
    row, render, respond, root };
}

for (const kind of ["song", "project"]) {
  test(kind + ": late project-a response cannot replace loaded project-b", async t => {
    const f = await mountHook(t, kind);
    await f.render("project-b");
    await f.respond(1, f.row("project-b"));
    await f.respond(0, f.row("project-a"));
    assert.equal(kind === "song" ? f.data().project_id : f.data().id, "project-b");
    assert.equal(f.state().loading, false);
    assert.deepEqual(f.writes, []);
  });

  test(kind + ": a failing new project does not retain prior project data", async t => {
    const f = await mountHook(t, kind);
    await f.respond(0, f.row("project-a"));
    await f.render("project-b");
    await f.respond(1, null, { message: "project-b denied" });
    assert.equal(f.data(), null);
    assert.equal(f.state().error, "project-b denied");
    assert.equal(f.state().loading, false);
    assert.deepEqual(f.writes, []);
  });

  test(kind + ": latest same-project reload wins when older response arrives last", async t => {
    const f = await mountHook(t, kind);
    await f.respond(0, f.row("project-a", "initial"));
    let older, newer;
    await act(async () => { older = f.state().reload(); newer = f.state().reload(); });
    await f.respond(2, f.row("project-a", "newer")); await newer;
    await f.respond(1, f.row("project-a", "older")); await older;
    assert.equal(f.data().title, "newer");
    assert.equal(f.state().loading, false);
  });

  test(kind + ": removing project context clears data and settles loading", async t => {
    const f = await mountHook(t, kind);
    await f.render(undefined);
    assert.equal(f.data(), null);
    assert.equal(f.state().loading, false);
    await f.respond(0, f.row("project-a"));
    assert.equal(f.data(), null);
    assert.equal(f.requests.length, 1);
  });

  test(kind + ": rejected reload is visible and settles loading", async t => {
    const f = await mountHook(t, kind);
    await f.respond(0, f.row("project-a"));
    let pending;
    await act(async () => { pending = f.state().reload(); pending.catch(() => {}); });
    await act(async () => {
      f.requests[1].reject({ message: "transport rejected" });
      await pending.catch(() => {});
    });
    assert.equal(f.state().error, "transport rejected");
    assert.equal(f.state().loading, false);
  });
}

test("song: late audio signature cannot replace another project's song", async t => {
  const f = await mountHook(t, "song");
  await f.respond(0, f.row("project-a", "a", "owner/a.mp3"));
  assert.equal(f.signatures.length, 1);
  await f.render("project-b");
  await f.respond(1, f.row("project-b"));
  await act(async () => f.signatures[0].resolve({ data: { signedUrl: "https://fixture.test/a.mp3" }, error: null }));
  assert.equal(f.data().project_id, "project-b");
  assert.equal(f.data().audio_url, null);
  assert.deepEqual(f.writes, []);
});

test("song: same-project reload read error preserves the last persisted song", async t => {
  const f = await mountHook(t, "song");
  await f.respond(0, f.row("project-a", "persisted"));
  let pending;
  await act(async () => { pending = f.state().reload(); });
  await f.respond(1, null, { message: "temporary read failure" }); await pending;
  assert.equal(f.data().title, "persisted");
  assert.equal(f.state().error, "temporary read failure");
  assert.equal(f.state().loading, false);
});

test("song: rejected audio signing is visible and does not erase persisted song", async t => {
  const f = await mountHook(t, "song");
  await f.respond(0, f.row("project-a", "persisted"));
  let pending;
  await act(async () => { pending = f.state().reload(); pending.catch(() => {}); });
  await f.respond(1, f.row("project-a", "fresh", "owner/a.mp3"));
  await act(async () => {
    f.signatures[0].reject({ message: "storage transport rejected" });
    await pending.catch(() => {});
  });
  assert.equal(f.state().error, "storage transport rejected");
  assert.equal(f.data().title, "persisted");
  assert.equal(f.state().loading, false);
});

for (const stage of ["song", "world", "style", "visual-plan", "scenes", "production"]) {
  test("App: switching " + stage + " project resets page-local draft state", async t => {
    const { dom, root } = browser(t, "/projects/project-a/" + stage);
    const pages = new Map();
    const supabase = { auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } };
    const App = evaluate("app/App.tsx", name => {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "../lib/supabase/client") return { supabase };
      if (name === "../lib/analytics") return {
        capturePageview() {}, identifyUser() {}, initAnalytics() {},
      };
      if (name.startsWith("../pages/")) {
        if (!pages.has(name)) pages.set(name, function Page({ projectId }) {
          const [draft] = React.useState("draft-for-" + projectId);
          return React.createElement("div", { "data-project": projectId }, draft);
        });
        return { default: pages.get(name) };
      }
      throw new Error("Unexpected App import: " + name);
    }, { window: dom.window }).default;
    await act(async () => root.render(React.createElement(App)));
    assert.equal(dom.window.document.querySelector("[data-project]").textContent, "draft-for-project-a");
    await act(async () => {
      dom.window.history.pushState({}, "", "/projects/project-b/" + stage);
      dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
    });
    assert.equal(dom.window.document.querySelector("[data-project]").getAttribute("data-project"), "project-b");
    assert.equal(dom.window.document.querySelector("[data-project]").textContent, "draft-for-project-b");
  });
}
