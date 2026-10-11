import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../src/hooks/useWorld.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

// Model effect setup -> cleanup -> setup with retained refs, as in StrictMode.
// All auth and HTTP responses are fixtures; no service or provider is called.
function mount() {
  const states = [], effects = [], refs = [], requests = [];
  let stateIndex = 0, refIndex = 0;
  const react = {
    useState(initial) {
      const index = stateIndex++;
      states[index] = initial;
      return [initial, value => { states[index] = value; }];
    },
    useRef(initial) {
      const index = refIndex++;
      refs[index] = { current: initial };
      return refs[index];
    },
    useCallback(fn) { return fn; },
    useEffect(fn) { effects.push(fn); },
  };
  const supabase = { auth: {
    getSession: async () => ({ data: { session: { access_token: "fixture-token" } } }),
    refreshSession: async () => { throw new Error("Unexpected auth refresh"); },
  } };
  const mod = { exports: {} };
  runInNewContext(code, {
    module: mod, exports: mod.exports,
    require(name) {
      if (name === "react") return react;
      if (name === "../lib/supabase/client") return {
        supabase, supabaseUrl: "https://fixture.test", supabasePublishableKey: "fixture-key",
      };
      if (name === "../lib/errorDetails") return {
        formatFailure: (_label, error) => error.message,
        formatHttpFailure: (_label, response, text) => "HTTP " + response.status + ": " + text,
      };
      throw new Error("Unexpected import: " + name);
    },
    fetch(url, options) {
      return new Promise(resolve => { requests.push({ url, options, resolve }); });
    },
    encodeURIComponent,
  });
  const hook = mod.exports.useWorld("project-1");
  let cleanups = [];
  const setup = () => { cleanups = effects.map(fn => fn()); };
  const cleanup = () => { cleanups.forEach(fn => { if (typeof fn === "function") fn(); }); };
  const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
  const respond = (index, report, status = 200) => {
    assert.ok(requests[index], "Expected pending request " + index);
    requests[index].resolve({
      ok: status >= 200 && status < 300, status,
      text: async () => status === 200 ? JSON.stringify({ report }) : "forbidden",
    });
  };
  return { hook, states, requests, setup, cleanup, flush, respond };
}

test("World load still completes in an ordinary effect lifetime", async () => {
  const f = mount(); f.setup(); await f.flush();
  f.respond(0, { id: "world-1" }); await f.flush();
  assert.equal(f.states[0].id, "world-1");
  assert.equal(f.states[1], false);
  assert.equal(f.states[5], null);
  f.cleanup();
});

test("StrictMode effect replay accepts current World response and ends loading", async () => {
  const f = mount(); f.setup(); await f.flush(); f.cleanup(); f.setup(); await f.flush();
  f.respond(1, { id: "current-world" }); await f.flush();
  assert.equal(f.states[0]?.id, "current-world");
  assert.equal(f.states[1], false);
  f.respond(0, { id: "stale-world" }); await f.flush();
  assert.equal(f.states[0].id, "current-world");
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(r => r.options.method === "GET"), "Replay must not generate or approve");
  f.cleanup();
});

test("StrictMode replay displays current HTTP failure and ends loading", async () => {
  const f = mount(); f.setup(); await f.flush(); f.cleanup(); f.setup(); await f.flush();
  f.respond(1, null, 403); await f.flush();
  assert.equal(f.states[1], false);
  assert.match(f.states[5], /403/);
  f.respond(0, { id: "stale-world" }); await f.flush();
  assert.equal(f.states[0], null);
  f.cleanup();
});

test("old lifetime response cannot resolve the current pending World load", async () => {
  const f = mount(); f.setup(); await f.flush(); f.cleanup(); f.setup(); await f.flush();
  f.respond(0, { id: "stale-world" }); await f.flush();
  assert.equal(f.states[0], null);
  assert.equal(f.states[1], true);
  f.respond(1, { id: "current-world" }); await f.flush();
  assert.equal(f.states[0].id, "current-world");
  assert.equal(f.states[1], false);
  f.cleanup();
});

test("World response after final unmount cannot mutate hook state", async () => {
  const f = mount(); f.setup(); await f.flush(); f.cleanup();
  const before = JSON.stringify(f.states);
  f.respond(0, { id: "world-1" }); await f.flush();
  assert.equal(JSON.stringify(f.states), before);
});

test("latest World reload still wins over an older response", async () => {
  const f = mount(); f.setup(); await f.flush();
  const reloading = f.hook.reload(); await f.flush();
  f.respond(1, { id: "current-world" }); await reloading;
  f.respond(0, { id: "stale-world" }); await f.flush();
  assert.equal(f.states[0].id, "current-world");
  assert.equal(f.states[1], false);
  f.cleanup();
});

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

async function mountReact(t) {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.test" });
  const previous = { window: globalThis.window, document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const requests = [];
  const mod = { exports: {} };
  runInNewContext(code, {
    module: mod, exports: mod.exports,
    require(name) {
      if (name === "react") return React;
      if (name === "../lib/supabase/client") return {
        supabase: { auth: { getSession: async () => ({
          data: { session: { access_token: "fixture-token" } },
        }) } },
        supabaseUrl: "https://fixture.test", supabasePublishableKey: "fixture-key",
      };
      if (name === "../lib/errorDetails") return {
        formatFailure: (_label, error) => error.message,
        formatHttpFailure: (_label, response, text) => "HTTP " + response.status + ": " + text,
      };
      throw new Error("Unexpected import: " + name);
    },
    fetch(url, options) {
      return new Promise(resolve => requests.push({ url, options, resolve }));
    },
    encodeURIComponent,
  });
  let latest;
  function Probe() { latest = mod.exports.useWorld("project-1"); return null; }
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
  await act(async () => root.render(React.createElement(React.StrictMode, null,
    React.createElement(Probe))));
  assert.equal(requests.length, 2, "Real React must replay the initial GET effect");
  return { requests, state: () => latest, respond: async (index, report, status = 200) => {
    await act(async () => requests[index].resolve({
      ok: status >= 200 && status < 300, status,
      text: async () => status === 200 ? JSON.stringify({ report }) : "forbidden",
    }));
  } };
}

test("real React StrictMode accepts current World response after effect replay", async t => {
  const f = await mountReact(t);
  await f.respond(1, { id: "current-world" });
  assert.equal(f.state().report?.id, "current-world");
  assert.equal(f.state().loading, false);
  await f.respond(0, { id: "stale-world" });
  assert.equal(f.state().report.id, "current-world");
  assert.ok(f.requests.every(r => r.options.method === "GET"));
});

test("real React StrictMode shows current HTTP error and leaves loading", async t => {
  const f = await mountReact(t);
  await f.respond(1, null, 403);
  assert.equal(f.state().loading, false);
  assert.match(f.state().error, /403/);
  await f.respond(0, { id: "stale-world" });
  assert.equal(f.state().report, null);
});
