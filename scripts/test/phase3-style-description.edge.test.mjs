import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStubClientFactory } from "./supabase_stub.mjs";

const FUNCTION_PATH = fileURLToPath(new URL("../../supabase/functions/beatvision-style-draft/index.ts", import.meta.url));
const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';
const SUPABASE_URL = "https://stub.supabase.co";
const APP_ORIGIN = "https://beat-vision-beat-vision.vercel.app";
const USER_ID = "owner-1";
const PROJECT_ID = "project-1";
const RECORD_ID = "character-1";
const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ERROR = console.error;
const CREATED_DIRS = [];

function makeDb({ ownerId = USER_ID, status = "draft" } = {}) {
  return {
    projects: [{ id: PROJECT_ID, owner_id: ownerId, world_report_id: "world-1", title: "Ghast" }],
    world_reports: [{
      id: "world-1", project_id: PROJECT_ID, status: "completed",
      confirmed_at: "2026-10-08T00:00:00.000Z", mood: "haunting",
      emotional_arc: "fragmented", visual_language: "grainy", cinematography: "deliberate",
      environments: [], color_lighting: "low key", motifs: ["mirror"], atmosphere: "oppressive",
      movement: "hesitant", continuity_rules: ["keep palette"], immutable_continuity: {},
    }],
    style_bibles: [{
      id: "style-1", project_id: PROJECT_ID, world_report_id: "world-1", status: "approved",
      world_basis: {}, visual_language: {}, cinematography: {}, color_lighting: {}, atmosphere: {},
      movement: {}, continuity_rules: [], visual_rules: [],
    }],
    characters: [{
      id: RECORD_ID, project_id: PROJECT_ID, world_report_id: "world-1", style_bible_id: "style-1",
      name: "Central Figure", status, sheet: { identity: "Primary subject", appearance: "" },
    }],
    environments: [],
  };
}

async function bootFunction({ authUserId = USER_ID, ownerId = USER_ID, status = "draft" } = {}) {
  const db = makeDb({ ownerId, status });
  const source = await readFile(FUNCTION_PATH, "utf8");
  assert.ok(source.includes(REMOTE_IMPORT));
  const dir = await mkdtemp(join(tmpdir(), "beatvision-style-draft-"));
  CREATED_DIRS.push(dir);
  await writeFile(join(dir, "supabase_stub.mjs"),
    "const factory = globalThis.__supabaseStubFactory;\nexport function createClient(url, key) { return factory(url, key); }\n");
  await writeFile(join(dir, "function.ts"), source.replace(REMOTE_IMPORT, 'from "./supabase_stub.mjs"'));

  let handler = null;
  let groqCalls = 0;
  globalThis.__supabaseStubFactory = createStubClientFactory(db);
  globalThis.Deno = {
    env: { get: (key) => ({
      SUPABASE_URL,
      SUPABASE_ANON_KEY: "anon",
      SUPABASE_SERVICE_ROLE_KEY: "service",
      GROQ_API_KEY: "groq",
    })[key] ?? "" },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve() }; },
  };
  console.error = () => {};
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) {
      if (!authUserId) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ id: authUserId }), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      groqCalls += 1;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        identity: "A solitary figure carrying the song's emotional conflict.",
        appearance: "Tired eyes, restrained posture, and an indistinct weathered silhouette.",
        wardrobe: "Layered charcoal streetwear with one muted red detail.",
        behavior: "Slow, hesitant movement interrupted by brief fragmented gestures.",
        continuity: "Keep silhouette, charcoal layers, muted red detail, and restrained posture consistent.",
      }) } }] }), { status: 200 });
    }
    throw new Error("unexpected network call: " + url);
  };

  try { await import(pathToFileURL(join(dir, "function.ts")).href + `?v=${Math.random()}`); }
  finally { delete globalThis.__supabaseStubFactory; }
  assert.equal(typeof handler, "function");
  return { handler, db, groqCalls: () => groqCalls };
}

function request(handler, { token = "valid", recordId = RECORD_ID } = {}) {
  const headers = { "Content-Type": "application/json", Origin: APP_ORIGIN };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return handler(new Request(`${SUPABASE_URL}/functions/v1/beatvision-style-draft`, {
    method: "POST", headers,
    body: JSON.stringify({ projectId: PROJECT_ID, kind: "character", recordId }),
  }));
}

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  console.error = ORIGINAL_ERROR;
  delete globalThis.__supabaseStubFactory;
  delete globalThis.Deno;
  for (const dir of CREATED_DIRS.splice(0)) await rm(dir, { recursive: true, force: true });
});

test("owner receives an editable proposal and the function does not persist it", async () => {
  const { handler, db, groqCalls } = await bootFunction();
  const before = structuredClone(db.characters[0]);
  const response = await request(handler);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.persisted, false);
  assert.ok(body.draft.appearance);
  assert.deepEqual(db.characters[0], before);
  assert.equal(groqCalls(), 1);
});

test("approved owner record may generate a proposal without mutating the approval", async () => {
  const { handler, db } = await bootFunction({ status: "approved" });
  const response = await request(handler);
  assert.equal(response.status, 200);
  assert.equal(db.characters[0].status, "approved");
  assert.equal(db.characters[0].sheet.appearance, "");
});

test("non-owner is rejected before any model call", async () => {
  const { handler, groqCalls } = await bootFunction({ authUserId: "other-user" });
  const response = await request(handler);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, "NOT_FOUND");
  assert.equal(groqCalls(), 0);
});

test("missing session is rejected before any model call", async () => {
  const { handler, groqCalls } = await bootFunction();
  const response = await request(handler, { token: null });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
  assert.equal(groqCalls(), 0);
});
