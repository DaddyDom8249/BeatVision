// Runtime regression coverage for the generation controller's authentication boundary.
// This loads the committed Edge Function source and exercises the real Deno.serve handler.
// The only substitutions are the platform imports and Supabase client auth call.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FUNCTION_PATH = fileURLToPath(new URL("../../supabase/functions/beatvision-generation/index.ts", import.meta.url));
const CREATED_DIRS = [];
const ORIGINAL_DENO = globalThis.Deno;

async function bootFunction({ authenticated = false } = {}) {
  const source = await readFile(FUNCTION_PATH, "utf8");
  const dir = await mkdtemp(join(tmpdir(), "beatvision-generation-auth-"));
  CREATED_DIRS.push(dir);

  const supabaseStub = `
export function createClient() {
  return {
    auth: {
      getUser: async () => authenticated
        ? { data: { user: { id: "user-1" } }, error: null }
        : { data: { user: null }, error: new Error("invalid session") },
    },
  };
}
`.replace("authenticated", JSON.stringify(authenticated));

  await writeFile(join(dir, "supabase_stub.mjs"), supabaseStub);

  const transformed = source
    .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', "")
    .replace('from "https://esm.sh/@supabase/supabase-js@2"', 'from "./supabase_stub.mjs"');
  await writeFile(join(dir, "function.ts"), transformed);

  let handler = null;
  globalThis.Deno = {
    env: { get: () => "" },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve() }; },
  };

  await import(pathToFileURL(join(dir, "function.ts")).href + "?auth=" + String(authenticated));
  assert.equal(typeof handler, "function");
  return handler;
}

after(async () => {
  globalThis.Deno = ORIGINAL_DENO;
  for (const dir of CREATED_DIRS.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generation controller returns 401 when Authorization is missing", async () => {
  const handler = await bootFunction();
  const response = await handler(new Request("https://stub/functions/v1/beatvision-generation", { method: "POST" }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
});

test("generation controller returns 401 when the session is rejected", async () => {
  const handler = await bootFunction();
  const response = await handler(new Request("https://stub/functions/v1/beatvision-generation", {
    method: "POST",
    headers: { Authorization: "Bearer invalid-token", "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: "project-1", jobId: "job-1", action: "run" }),
  }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
});
