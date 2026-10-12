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

async function mount(t, response, search = "?next=/projects/new") {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.test/auth" + search });
  const previous = { window: globalThis.window, document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [], navigation = [];
  const root = createRoot(document.getElementById("root"));
  t.after(async () => {
    try { await act(async () => root.unmount()); }
    finally { dom.window.close(); for (const [key,value] of Object.entries(previous)) {
      if(value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } }
  });
  const helper = { exports: {} };
  runInNewContext(compile("lib/formatCreativeText.ts"), { module: helper, exports: helper.exports });
  const mod = { exports: {} };
  const supabase = { auth: {
    signInWithPassword: async credentials => { calls.push({ mode: "sign-in", credentials }); return response("sign-in"); },
    signUp: async credentials => { calls.push({ mode: "sign-up", credentials }); return response("sign-up"); },
  } };
  runInNewContext(compile("pages/AuthPage.tsx"), {
    module: mod, exports: mod.exports, window: dom.window, URLSearchParams,
    require(name) {
      if(name === "react") return React;
      if(name === "react/jsx-runtime") return jsxRuntime;
      if(name === "../lib/supabase/client") return { supabase };
      if(name === "../lib/analytics") return { capture() {} };
      if(name === "../lib/formatCreativeText") return helper.exports;
      throw Error("Unexpected import " + name);
    },
  });
  await act(async () => root.render(React.createElement(mod.exports.default, { onNavigate: path => navigation.push(path) })));
  return {
    calls, navigation,
    button: () => document.querySelector("form button"),
    submit: async () => { await act(async () => {
      document.querySelector("form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    }); },
    signup: async () => { await act(async () => document.querySelector(".auth-switch").click()); },
  };
}

for (const mode of ["sign-in", "sign-up"]) {
  test(mode + " transport rejection exposes error and permits an explicit retry", async t => {
    let fail = true;
    const f = await mount(t, () => {
      if(fail) throw { message: "Authentication transport unavailable" };
      return { data: { session: mode === "sign-up" ? null : { access_token: "fixture-session" } }, error: null };
    });
    if(mode === "sign-up") await f.signup();
    await f.submit();
    assert.match(document.querySelector('[role="alert"]').textContent, /Authentication transport unavailable/);
    assert.equal(f.button().disabled, false);
    assert.deepEqual(f.navigation, []);
    assert.equal(f.calls.length, 1);
    fail = false; await f.submit();
    assert.equal(f.calls.length, 2);
    assert.equal(f.button().disabled, false);
    if(mode === "sign-in") assert.deepEqual(f.navigation, ["/projects/new"]);
    else {
      assert.deepEqual(f.navigation, []);
      assert.match(document.querySelector('[role="status"]').textContent, /Check your email/);
    }
  });
}

test("structured sign-in rejection stays on auth without a retry or navigation", async t => {
  const f = await mount(t, () => ({ data: { session: null }, error: { message: "Invalid login credentials" } }));
  await f.submit();
  assert.match(document.querySelector('[role="alert"]').textContent, /Invalid login credentials/);
  assert.equal(f.button().disabled, false);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.navigation, []);
});

test("successful sign-in preserves the existing default dashboard destination", async t => {
  const f = await mount(t, () => ({ data: { session: { access_token: "fixture-session" } }, error: null }), "");
  await f.submit();
  assert.deepEqual(f.navigation, ["/"]);
  assert.equal(f.calls.length, 1);
});
