// Hardening 2026-10-14: body-size limits and no internal error leakage in
// beatvision-style-draft and beatvision-world.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';
const ORIGIN = "https://beat-vision-beat-vision.vercel.app";
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ERROR = console.error;
const DIRS = [];
const INTERNAL = 'relation "private.secret_table" permission denied for service_role';

// Every query chain resolves to a database error carrying internal detail.
function failingClient() {
  const result = { data: null, error: { message: INTERNAL } };
  const chain = new Proxy(function () {}, {
    get(_t, prop) { if (prop === "then") return (resolve) => resolve(result); return chain; },
    apply() { return chain; },
  });
  return { from: () => chain, rpc: () => chain, auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) } };
}

async function boot(fn) {
  const source = await readFile(fileURLToPath(new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url)), "utf8");
  const dir = await mkdtemp(join(tmpdir(), "bv-harden-")); DIRS.push(dir);
  await writeFile(join(dir, "stub.mjs"), "export function createClient(){ return globalThis.__hardenClient(); }\n");
  await writeFile(join(dir, "f.ts"), source.replace(REMOTE_IMPORT, 'from "./stub.mjs"'));
  let handler; let providerCalls = 0;
  globalThis.__hardenClient = failingClient;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://stub.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", GROQ_API_KEY: "groq" })[k] ?? "" },
    serve: (h) => { handler = h; return { finished: Promise.resolve() }; } };
  console.error = () => {};
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: "u1" }), { status: 200 });
    providerCalls += 1; throw new Error("unexpected provider call " + input);
  };
  await import(pathToFileURL(join(dir, "f.ts")).href + `?v=${Math.random()}`);
  return { handler, providerCalls: () => providerCalls };
}
const post = (handler, fn, body) => handler(new Request(`https://stub.supabase.co/functions/v1/${fn}`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, Authorization: "Bearer t" }, body }));

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH; console.error = ORIGINAL_ERROR; delete globalThis.Deno; delete globalThis.__hardenClient;
  for (const d of DIRS) await rm(d, { recursive: true, force: true });
});

for (const [fn, limit] of [["beatvision-style-draft", 64 * 1024], ["beatvision-world", 256 * 1024]]) {
  test(`${fn} rejects oversized bodies with 413 before any database or provider work`, async () => {
    const { handler, providerCalls } = await boot(fn);
    const res = await post(handler, fn, JSON.stringify({ projectId: "p", kind: "character", recordId: "r", pad: "x".repeat(limit + 1) }));
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, "REQUEST_TOO_LARGE");
    assert.equal(providerCalls(), 0);
  });
  test(`${fn} does not leak internal database error text`, async () => {
    const { handler } = await boot(fn);
    const res = await post(handler, fn, JSON.stringify({ projectId: "p", kind: "character", recordId: "r" }));
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.ok(!text.includes("secret_table") && !text.includes("service_role"), text);
  });
}
