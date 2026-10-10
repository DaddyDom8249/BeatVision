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
const JSR_IMPORT = 'import "jsr:@supabase/functions-js/edge-runtime.d.ts";';
const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';

const ORIGINAL_FETCH = globalThis.fetch;
const CREATED_DIRS = [];

async function bootFunction({ authUserId = USER_ID, ownerId = USER_ID, analysis = null, songDuration = 249.126908314, groqData = { text: 'hello world', segments: [], words: [] }, groqStatus = 200 } = {}) {
  const db = {
    projects: [{ id: PROJECT_ID, owner_id: ownerId, song_duration: songDuration }],
    songs: [
      {
        id: "song-1",
        project_id: PROJECT_ID,
        audio_path: `${USER_ID}/${PROJECT_ID}/track.mp3`,
        analysis,
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
  const originalFactory = globalThis.__supabaseStubFactory;
  globalThis.__supabaseStubFactory = createStubClientFactory(db);
  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL,
          SUPABASE_ANON_KEY: "stub-anon",
          SUPABASE_PUBLISHABLE_KEY: "stub-publishable",
          SUPABASE_SERVICE_ROLE_KEY: "stub-service",
          GROQ_API_KEY: "stub-groq",
        })[key] ?? "",
    },
    serve: (fn) => {
      handler = fn;
      return { finished: Promise.resolve() };
    },
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) {
      if (!authUserId) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ id: authUserId }), { status: 200 });
    }
    if (url.includes("api.groq.com")) {
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
  return { handler, db };
}

function call(handler, body, { token = "valid-token", method = "POST" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  // GET/HEAD must not carry a body or Request throws.
  const hasBody = method !== "GET" && method !== "HEAD";
  return handler(
    new Request(`${SUPABASE_URL}/functions/v1/beatvision-analyze-song`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
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

test("reads audio from the `songs` bucket production actually uses", async () => {
  storageBucketCalls.length = 0;
  const { handler } = await bootFunction();
  const response = await call(handler, { projectId: PROJECT_ID });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "completed");

  assert.equal(storageBucketCalls.length, 1, "expected exactly one signed-url request");
  assert.equal(
    storageBucketCalls[0].bucket,
    "songs",
    "transcription must read the bucket the frontend uploads to"
  );
  assert.ok(
    storageBucketCalls.every((entry) => entry.bucket !== "audio"),
    "the stale `audio` bucket must not be referenced"
  );
});

test("successful transcription persists Groq provenance", async () => {
  const { handler } = await bootFunction();
  const response = await call(handler, { projectId: PROJECT_ID });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.analysis.transcription_provider, "groq");
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
  const { handler } = await bootFunction({ authUserId: "someone-else" });

  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 403);
  assert.equal(storageBucketCalls.length, 0, "no storage access for a non-owner");
});

test("non-POST requests are rejected", async () => {
  const { handler } = await bootFunction();
  const response = await call(handler, { projectId: PROJECT_ID }, { method: "GET" });
  assert.equal(response.status, 405);
});

test("Groq transcription preserves the decoded song duration and musical timecodes", async () => {
  const analysis = { analysis_method: "browser_audio_decode", duration_seconds: 249.126908314, sections: [{ start: 0, end: 249.126908314 }], bpm: 84 };
  const { handler, db } = await bootFunction({ analysis, songDuration: analysis.duration_seconds, groqData: { text: "transcribed lyrics", duration: 240, segments: [], words: [] } });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.analysis.duration_seconds, analysis.duration_seconds);
  assert.equal(db.projects[0].song_duration, analysis.duration_seconds);
  assert.deepEqual(body.analysis.sections, analysis.sections);
  assert.equal(body.analysis.bpm, 84);
  assert.equal(body.analysis.transcript, "transcribed lyrics");
});

test("server-only analysis can obtain song duration from Groq when browser decoding is unavailable", async () => {
  const { handler, db } = await bootFunction({ analysis: null, songDuration: null, groqData: { text: "lyrics", duration: 249.126908314 } });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).analysis.duration_seconds, 249.126908314);
  assert.equal(db.projects[0].song_duration, 249.126908314);
});

test("invalid duration metadata falls back to the persisted song duration", async () => {
  const { handler } = await bootFunction({ analysis: { duration_seconds: -1 }, songDuration: 249.126908314, groqData: { text: "lyrics", duration: 0 } });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).analysis.duration_seconds, 249.126908314);
});

test("analysis without any valid song duration cannot be marked completed", async () => {
  const { handler, db } = await bootFunction({ analysis: null, songDuration: null, groqData: { text: "lyrics" } });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "AUDIO_DURATION_UNAVAILABLE");
  assert.notEqual(db.songs[0].analysis_status, "completed");
  assert.equal(db.songs[0].analysis, null);
  assert.equal(db.projects[0].song_duration, null);
});

test("failed Groq transcription preserves the saved local analysis", async () => {
  const analysis = { analysis_method: "browser_audio_decode", duration_seconds: 249.126908314, bpm: 84 };
  const { handler, db } = await bootFunction({ analysis, groqStatus: 503, groqData: { error: { message: "Provider unavailable" } } });
  const response = await call(handler, { projectId: PROJECT_ID });
  assert.equal(response.status, 500);
  assert.match((await response.json()).error, /Provider unavailable/);
  assert.deepEqual(db.songs[0].analysis, analysis);
  assert.notEqual(db.songs[0].analysis_status, "completed");
});
