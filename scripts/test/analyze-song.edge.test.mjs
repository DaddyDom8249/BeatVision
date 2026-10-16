// Regression coverage for the beatvision-analyze-song Edge Function.
//
// Same approach as beatvision-world.edge.test.mjs: load the REAL source,
// replace only its remote imports with the local stand-in, then drive the
// registered handler with real Request objects.
//
// The bucket assertion is the important one — production stores audio in the
// `songs` bucket, and the stale `audio` reference silently broke transcription.
//
// Run with: npm test

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStubClientFactory, storageBucketCalls } from "./supabase_stub.mjs";

const FUNCTION_PATH = fileURLToPath(
  new URL("../../supabase/functions/beatvision-analyze-song/index.ts", import.meta.url)
);
const SUPABASE_URL = "https://stub.supabase.co";
const USER_ID = "user-owner-1";
const PROJECT_ID = "project-1";
const AUDIO_REVISION_A = "11111111-1111-4111-8111-111111111111";
const AUDIO_REVISION_B = "22222222-2222-4222-8222-222222222222";
const JSR_IMPORT = 'import "jsr:@supabase/functions-js/edge-runtime.d.ts";';
const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';

const ORIGINAL_FETCH = globalThis.fetch;
const CREATED_DIRS = [];

async function bootFunction({ authUserId = USER_ID, ownerId = USER_ID, analysis = null, songDuration = 249.126908314, groqData = { text: 'hello world', segments: [], words: [] }, groqStatus = 200, freeKey = "", replaceDuringTranscription = false } = {}) {
  const db = {
    projects: [{ id: PROJECT_ID, owner_id: ownerId, song_duration: songDuration }],
    songs: [
      {
        id: "song-1",
        project_id: PROJECT_ID,
        audio_path: `${USER_ID}/${PROJECT_ID}/track.mp3`,
        analysis, audio_revision: AUDIO_REVISION_A,
      },
    ],
  };

  const source = await readFile(FUNCTION_PATH, "utf8");
  for (const specifier of [JSR_IMPORT, REMOTE_IMPORT]) {
    if (!source.includes(specifier)) {
      throw new Error(`expected to find specifier: ${specifier}`);
    }
  }
  const rewritten = source
    .replace(JSR_IMPORT, "")
    .replace(REMOTE_IMPORT, 'from "./supabase_stub.mjs"');

  const dir = await mkdtemp(join(tmpdir(), "analyze-song-"));
  CREATED_DIRS.push(dir);
  await writeFile(
    join(dir, "supabase_stub.mjs"),
    "const factory = globalThis.__supabaseStubFactory;\nexport function createClient(url, key) { return factory(url, key); }\n"
  );
  await writeFile(join(dir, "function.ts"), rewritten);

  let handler = null;
  const providerCalls = [];
  const originalFactory = globalThis.__supabaseStubFactory;
  const baseFactory = createStubClientFactory(db);
  let rpcCalls = 0;
  globalThis.__supabaseStubFactory = (url, key) => {
    const client = baseFactory(url, key);
    return {
      ...client,
      rpc: async (name, args) => {
        rpcCalls++;
        assert.equal(name, "complete_song_transcription");
        // Transaction stand-in: reject stale snapshots without writing either row.
        const song = db.songs[0], project = db.projects[0];
        if (args.p_actor_id !== project.owner_id || args.p_project_id !== project.id)
          return { data: null, error: { message: "SONG_NOT_FOUND_OR_FORBIDDEN" } };
        if (args.p_song_id !== song.id || args.p_audio_revision !== song.audio_revision ||
            args.p_audio_path !== song.audio_path)
          return { data: false, error: null };
        song.analysis = args.p_analysis;
        song.analysis_audio_revision = args.p_audio_revision;
        song.analysis_status = "completed";
        project.song_duration = args.p_duration;
        return { data: true, error: null };
      },
    };
  };
  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL,
          SUPABASE_ANON_KEY: "stub-anon",
          SUPABASE_PUBLISHABLE_KEY: "stub-publishable",
          SUPABASE_SERVICE_ROLE_KEY: "stub-service",
          GROQ_API_KEY: "stub-groq",
          GROQ_FREE_API_KEY: freeKey,
        })[key] ?? "",
    },
    serve: (fn) => {
      handler = fn;
      return { finished: Promise.resolve() };
    },
  };
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) {
      if (!authUserId) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ id: authUserId }), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
      providerCalls.push({ url, options });
      assert.equal(options.headers.Authorization, "Bearer " + freeKey);
      assert.equal(options.body.get("model"), "whisper-large-v3-turbo");
      if (replaceDuringTranscription) {
        // Another browser replaces the track while provider inference is in flight.
        db.songs[0].audio_revision = AUDIO_REVISION_B;
        db.songs[0].audio_path = "user-owner-1/project-1/new-track.mp3";
        db.songs[0].analysis = { duration_seconds: 73, transcript: null };
        db.songs[0].analysis_status = "analyzing";
        db.projects[0].song_duration = 73;
      }
      return new Response(JSON.stringify(groqData), {
        status: groqStatus,
      });
    }
    throw new Error(`unexpected network call: ${url}`);
  };

  try {
    await import(pathToFileURL(join(dir, "function.ts")).href);
  } finally {
    globalThis.__supabaseStubFactory = originalFactory;
  }

  if (typeof handler !== "function") {
    throw new Error("function did not register a handler via Deno.serve");
  }
  return { handler, db, providerCalls, rpcCalls: () => rpcCalls };
}

test("free-key transcription preserves decoded timing and prior signal analysis", async () => {
  const analysis = { duration_seconds: 249.126908314, sections: [{ start_time: 0, end_time: 249.126908314 }], bpm: 100 };
  const { handler, db, providerCalls } = await bootFunction({ freeKey: "fixture-free-key", analysis, groqData: { text: "Fixture transcript", duration: 240 } });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 200);
  assert.equal(providerCalls.length, 1);
  assert.equal(db.songs[0].analysis.duration_seconds, analysis.duration_seconds);
  assert.deepEqual(db.songs[0].analysis.sections, analysis.sections);
  assert.equal(db.songs[0].analysis.transcription_provider, "groq");
  assert.equal(storageBucketCalls.at(-1).bucket, "songs");
});

test("audio replaced during Groq request cannot overwrite new-track analysis or project duration", async () => {
  const original = { duration_seconds: 249.126908314, sections: [{ start_time: 0, end_time: 249.126908314 }] };
  const { handler, db, providerCalls, rpcCalls } = await bootFunction({
    freeKey: "fixture-free-key", analysis: original, replaceDuringTranscription: true,
    groqData: { text: "obsolete track A transcription", duration: 249 },
  });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "SONG_AUDIO_REVISION_CHANGED");
  assert.equal(providerCalls.length, 1);
  assert.equal(rpcCalls(), 1);
  assert.deepEqual(db.songs[0].analysis, { duration_seconds: 73, transcript: null });
  assert.equal(db.songs[0].analysis_status, "analyzing");
  assert.equal(db.songs[0].audio_revision, AUDIO_REVISION_B);
  assert.equal(db.projects[0].song_duration, 73);
});

test("already-stale client audio revision is rejected before any provider or storage request", async () => {
  storageBucketCalls.length = 0;
  const { handler, db, providerCalls, rpcCalls } = await bootFunction({ freeKey: "fixture-free-key" });
  const response = await call(handler, { projectId: PROJECT_ID, audioRevision: AUDIO_REVISION_B });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "SONG_AUDIO_REVISION_CHANGED");
  assert.equal(providerCalls.length, 0);
  assert.equal(rpcCalls(), 0);
  assert.equal(storageBucketCalls.length, 0);
  assert.equal(db.songs[0].analysis, null);
});

test("missing revision refuses transcription without provider access", async () => {
  const { handler, providerCalls, rpcCalls } = await bootFunction({ freeKey: "fixture-free-key" });
  const response = await call(handler, { projectId: PROJECT_ID, audioRevision: "" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "SONG_AUDIO_REVISION_REQUIRED");
  assert.equal(providerCalls.length, 0);
  assert.equal(rpcCalls(), 0);
});

test("transcription quota failure does not alter local analysis or try another key", async () => {
  const { handler, db, providerCalls } = await bootFunction({ freeKey: "fixture-free-key", groqStatus: 429 });
  const before = structuredClone(db);
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 500);
  assert.deepEqual(db, before);
  assert.equal(providerCalls.length, 1);
});

function call(handler, body, { token = "valid-token", method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  // GET/HEAD must not carry a body or Request throws.
  const hasBody = method !== "GET" && method !== "HEAD";
  return handler(
    new Request(`${SUPABASE_URL}/functions/v1/beatvision-analyze-song`, {
      method,
      headers,
      body: hasBody ? JSON.stringify({ audioRevision: AUDIO_REVISION_A, ...body }) : undefined,
    })
  );
}

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete globalThis.__supabaseStubFactory;
  delete globalThis.Deno;
  for (const dir of CREATED_DIRS.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unverified account is refused before signed storage access or inference", async () => {
 storageBucketCalls.length=0;
 const {handler,db}=await bootFunction(); const before=structuredClone(db.songs);
 const response=await call(handler,{projectId:PROJECT_ID});
 assert.equal(response.status,503);assert.match((await response.json()).error,/PROVIDER_COST_UNVERIFIED/);
 assert.equal(storageBucketCalls.length,0);assert.deepEqual(db.songs,before);
});

test("unverified account cannot write fabricated transcription provenance",async()=>{
 const {handler,db}=await bootFunction();const before=structuredClone(db.songs);
 const response=await call(handler,{projectId:PROJECT_ID});assert.equal(response.status,503);assert.deepEqual(db.songs,before);
});

test("missing Authorization header returns 401, not 500", async () => {
  const { handler } = await bootFunction();
  const response = await call(handler, { projectId: PROJECT_ID }, { token: null });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHENTICATED");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("rejected session returns 401, not 500", async () => {
  const { handler } = await bootFunction({ authUserId: null });
  const response = await call(handler, { projectId: PROJECT_ID });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "UNAUTHENTICATED");
});

test("another user's project is refused before any storage read", async () => {
  storageBucketCalls.length = 0;
  const { handler } = await bootFunction({ authUserId: "someone-else", freeKey: "fixture-free-key" });

  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 403);
  assert.equal(storageBucketCalls.length, 0, "no storage access for a non-owner");
});

test("non-POST requests are rejected", async () => {
  const { handler } = await bootFunction();
  const response = await call(handler, { projectId: PROJECT_ID }, { method: "GET" });
  assert.equal(response.status, 405);
});

for (const analysis of [
 {duration_seconds:60,sections:[{index:0,start_time:0,end_time:60}]},
 null,
 {duration_seconds:0},
 {duration_seconds:60,transcription_status:'failed'}
]) test('unverified transcription preserves prior duration/sections and cannot claim completion: '+JSON.stringify(analysis),async()=>{
 const {handler,db}=await bootFunction({analysis});const before=structuredClone(db.songs);
 const response=await call(handler,{projectId:PROJECT_ID});assert.equal(response.status,503);
 assert.match((await response.json()).error,/PROVIDER_COST_UNVERIFIED/);assert.deepEqual(db.songs,before);
});
