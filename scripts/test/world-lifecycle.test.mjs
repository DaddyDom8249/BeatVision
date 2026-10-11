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
