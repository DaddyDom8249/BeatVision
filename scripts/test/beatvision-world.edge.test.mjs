// Regression coverage for the beatvision-world Edge Function.
//
// This suite loads the REAL source of supabase/functions/beatvision-world/index.ts,
// swaps only its network import for the local supabase_stub.mjs stand-in, and then
// drives the exported request handler with real Request objects. Every assertion
// below therefore exercises committed function code, not a copy of it.
//
// Run with: npm test

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStubClientFactory } from "./supabase_stub.mjs";

const FUNCTION_PATH = fileURLToPath(new URL("../../supabase/functions/beatvision-world/index.ts", import.meta.url));
const SUPABASE_URL = "https://stub.supabase.co";
const APP_ORIGIN = "https://beat-vision-beat-vision.vercel.app";
const PR_PREVIEW_ORIGIN = "https://beat-vision-git-fix-style-description-genera-790bfa-beat-vision.vercel.app";
const USER_ID = "user-owner-1";
const PROJECT_ID = "project-1";
const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_LOG = console.log;

// Temp modules created per test; removed in after() so /tmp never accumulates.
const CREATED_DIRS = [];

const WORLD_FIELDS = [
  "mood",
  "emotional_arc",
  "visual_language",
  "cinematography",
  "environments",
  "color_lighting",
  "motifs",
  "atmosphere",
  "movement",
  "continuity_rules",
  "immutable_continuity",
];

/** The payload WorldReport.tsx builds: every field, parsed when possible, else raw text. */
function uiPayload() {
  const changes = {};
  for (const key of WORLD_FIELDS) {
    changes[key] = key === "motifs" ? ["rain", "neon"] : key === "mood" ? { tone: "brooding" } : `${key} — revised by the artist`;
  }
  return { projectId: PROJECT_ID, action: "save_edits", changes };
}

function makeWorldReport(overrides = {}) {
  return {
    id: "world-1",
    project_id: PROJECT_ID,
    status: "completed",
    mood: { tone: "original" },
    emotional_arc: { beat: "original" },
    visual_language: "original",
    cinematography: "original",
    environments: "original",
    color_lighting: "original",
    motifs: ["original"],
    atmosphere: "original",
    movement: "original",
    continuity_rules: "original",
    immutable_continuity: "original",
    raw_report: { model: "openai/gpt-oss-20b" },
    provider: "groq",
    provider_request_id: null,
    error_code: null,
    error_message: null,
    confirmed_at: null,
    created_at: "2026-10-03T00:00:00.000Z",
    updated_at: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

function makeDb(worldOverrides = {}, interpretationEnabled = true) {
  const interpretation = {
    id: "interpretation-1", song_id: "song-1", audio_revision: "11111111-1111-4111-8111-111111111111",
    source_fingerprint: "a".repeat(64), creative_source_fingerprint: "c".repeat(64), status: "confirmed", version: 1,
    interpretation: { schema_version: 1, summary: "A verified fixture interpretation", claims: [] },
    evidence: [{ id: "artist.interpretation", kind: "artist", reference: "fixture", excerpt: "fixture" }],
    confirmed_at: "2026-10-03T00:00:00.000Z",
  };
  return {
    projects: [
      {
        id: PROJECT_ID,
        owner_id: USER_ID,
        world_report_id: "world-1",
        world_confirmed_at: null,
        title: "Midnight",
      },
    ],
    world_reports: [makeWorldReport(worldOverrides)],
    songs: [
      { id: "song-1", project_id: PROJECT_ID, title: "Midnight", artist: "Artist", analysis_status: "completed", analysis: {}, ...(interpretationEnabled ? { audio_revision: interpretation.audio_revision, audio_source_fingerprint: interpretation.source_fingerprint, current_interpretation_id: interpretation.id, interpretation_confirmed_at: interpretation.confirmed_at } : {}) },
    ],
    song_interpretations: interpretationEnabled ? [interpretation] : [],
  };
}

/**
 * Boots the real function module against a stub database.
 * `authUserId` controls which authenticated user the token resolves to.
 */
async function bootFunction({ worldOverrides = {}, authUserId = USER_ID, freeKey = "", providerStatus = 200, interpretationEnabled = true, onProviderRequest = null } = {}) {
  const db = makeDb(worldOverrides, interpretationEnabled);
  const source = await readFile(FUNCTION_PATH, "utf8");
  if (!source.includes(REMOTE_IMPORT)) {
    throw new Error(`Expected to find the network import ${REMOTE_IMPORT} in ${FUNCTION_PATH}`);
  }

  const dir = await mkdtemp(join(tmpdir(), "beatvision-world-"));
  CREATED_DIRS.push(dir);
  // Bridge the function's named import to the reusable stub factory. The fake
  // client itself stays in supabase_stub.mjs; only the export name is adapted.
  await writeFile(
    join(dir, "supabase_stub.mjs"),
    // Capture the factory at module-evaluation time so the global can be
    // restored immediately after import without breaking later handler calls.
    "const factory = globalThis.__supabaseStubFactory;\nexport function createClient(url, key) {\n  return factory(url, key);\n}\n"
  );
  // Keep the .ts extension so Node type-strips the function source rather than
  // parsing TypeScript annotations as plain JavaScript.
  await writeFile(join(dir, "function.ts"), source.replace(REMOTE_IMPORT, 'from "./supabase_stub.mjs"'));

  let handler = null;
  const providerCalls = [];
  const logs = [];
  // The function logs while serving the request, not while loading, so the
  // capture stays installed for the lifetime of the tests.
  console.log = (...args) => logs.push(args.map(String).join(" "));

  globalThis.Deno = {
    env: {
      get: (key) =>
        ({
          SUPABASE_URL,
          SUPABASE_ANON_KEY: "stub-anon-key",
          SUPABASE_SERVICE_ROLE_KEY: "stub-service-role-key",
          GROQ_API_KEY: "stub-groq-key",
          GROQ_FREE_API_KEY: freeKey,
          GROQ_FREE_ACCOUNT_VERIFIED: freeKey ? "true" : "",
          GEMINI_API_KEY: "paid-gemini-key",
          OPENROUTER_API_KEY: "unverified-openrouter-key",
        })[key] ?? "",
    },
    serve: (fn) => {
      handler = fn;
      return { finished: Promise.resolve() };
    },
  };
  const originalFactory = globalThis.__supabaseStubFactory;
  globalThis.__supabaseStubFactory = () => ({
    ...createStubClientFactory(db)(),
    rpc: async (name, args) => {
      if (name === "song_creative_fingerprint") {
        assert.equal(args.p_song_id, "song-1");
        return { data: db.songs[0].creative_changed ? "e".repeat(64) : "c".repeat(64), error: null };
      }
      if (name === "persist_current_interpretation_world") {
        const song = db.songs[0];
        const approved = db.song_interpretations.find((entry) => entry.id === song.current_interpretation_id);
        if (!approved || approved.status !== "confirmed" ||
            approved.id !== args.p_expected_interpretation_id ||
            approved.creative_source_fingerprint !== args.p_expected_creative_source_fingerprint ||
            song.creative_changed || !song.interpretation_confirmed_at ||
            args.p_existing_world_report_id !== (db.world_reports[0]?.id ?? null)) {
          return { data: null, error: { message: "WORLD_INTERPRETATION_SOURCE_STALE" } };
        }
        const payload = { ...args.p_payload,
          interpretation_id: approved.id,
          interpretation_source_fingerprint: approved.source_fingerprint,
          confirmed_at: null };
        const existing = db.world_reports[0];
        if (existing) Object.assign(existing, payload);
        else db.world_reports.push({ id: "world-1", project_id: PROJECT_ID,
          world_id: "00000000-0000-4000-8000-000000000001", revision_number: 1, ...payload });
        return { data: db.world_reports[0], error: null };
      }
      throw new Error("Unexpected World RPC: " + name);
    },
  });
  // The handler resolves the caller's token with fetch() on every request, so
  // this stub must stay installed for the lifetime of the tests.
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith("/auth/v1/user")) {
      if (!authUserId) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ id: authUserId }), { status: 200 });
    }
    providerCalls.push({ url: String(input), options });
    assert.equal(String(input), "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer " + freeKey);
    assert.equal(JSON.parse(options.body).model, "openai/gpt-oss-20b");
    if (onProviderRequest) onProviderRequest(db);
    return new Response(JSON.stringify(providerStatus === 200
      ? { id: "fixture-request", choices: [{ message: { content: JSON.stringify(uiPayload().changes) } }] }
      : { error: { message: "Fixture quota exhausted" } }), { status: providerStatus });
  };

  try {
    await import(pathToFileURL(join(dir, "function.ts")).href);
  } finally {
    globalThis.__supabaseStubFactory = originalFactory;
  }

  if (typeof handler !== "function") {
    throw new Error("Function module did not register a request handler via Deno.serve");
  }
  return { handler, db, logs, providerCalls };
}

test("World generation uses only the dedicated free key even when paid providers are configured", async () => {
  const { handler, providerCalls } = await bootFunction({ freeKey: "fixture-free-key" });
  const response = await request(handler, { method: "POST", body: { projectId: PROJECT_ID } });
  assert.equal(response.status, 200);
  const { report } = await response.json();
  assert.equal(report.status, "completed");
  assert.equal(report.provider, "groq");
  assert.equal(report.confirmed_at, null);
  assert.equal(providerCalls.length, 1);
});

test("in-flight World generation cannot persist after the artist changes creative input", async () => {
  const { handler, db, providerCalls } = await bootFunction({
    freeKey: "fixture-free-key",
    onProviderRequest: (state) => { state.songs[0].creative_changed = true; state.songs[0].lyrics = "An updated verse"; },
  });
  const before = structuredClone(db.world_reports);
  const response = await request(handler, { method: "POST", body: { projectId: PROJECT_ID } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "WORLD_INTERPRETATION_SOURCE_STALE");
  assert.deepEqual(db.world_reports, before);
  assert.equal(providerCalls.length, 1);
});

test("World Reveal rejects a newly confirmed interpretation while provider inference is in flight", async () => {
  const { handler, db } = await bootFunction({
    freeKey: "fixture-free-key",
    onProviderRequest: (state) => { state.songs[0].current_interpretation_id = "newer-interp"; },
  });
  const before = structuredClone(db.world_reports);
  const response = await request(handler, { method: "POST", body: { projectId: PROJECT_ID } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "WORLD_INTERPRETATION_SOURCE_STALE");
  assert.deepEqual(db.world_reports, before);
});

test("World Reveal is server-blocked until an artist-confirmed interpretation has current audio lineage", async () => {
  const { handler, providerCalls } = await bootFunction({ freeKey: "fixture-free-key", interpretationEnabled: false });
  const response = await request(handler, { method: "POST", body: { projectId: PROJECT_ID } });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "SONG_INTERPRETATION_REQUIRED");
  assert.equal(providerCalls.length, 0);
});

test("World quota failure makes one free-key request with no paid fallback", async () => {
  const { handler, providerCalls } = await bootFunction({ freeKey: "fixture-free-key", providerStatus: 429 });
  const response = await request(handler, { method: "POST", body: { projectId: PROJECT_ID } });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).report.error_code, "WORLD_MODEL_FAILED");
  assert.equal(providerCalls.length, 1);
});

test("confirmed World remains immutable with the free key configured", async () => {
  const { handler, db, providerCalls } = await bootFunction({ freeKey: "fixture-free-key", worldOverrides: { confirmed_at: "2026-10-15T00:00:00Z" } });
  const before = structuredClone(db.world_reports);
  const response = await request(handler, { method: "POST", body: { projectId: PROJECT_ID } });
  assert.equal(response.status, 409);
  assert.deepEqual(db.world_reports, before);
  assert.equal(providerCalls.length, 0);
});

function request(handler, { method = "PATCH", body, token = "valid-token", origin = APP_ORIGIN } = {}) {
  const headers = { "Content-Type": "application/json", Origin: origin };
  // `token: null` omits the Authorization header entirely.
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return handler(
    new Request(`${SUPABASE_URL}/functions/v1/beatvision-world?projectId=${encodeURIComponent(PROJECT_ID)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
}

function patch(handler, body, opts = {}) {
  return request(handler, { ...opts, method: "PATCH", body });
}

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  console.log = ORIGINAL_LOG;
  delete globalThis.__supabaseStubFactory;
  delete globalThis.Deno;
  for (const dir of CREATED_DIRS.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

test("save_edits accepts the exact payload WorldReport.tsx sends and returns 200", async () => {
  const { handler, db } = await bootFunction();
  const response = await patch(handler, uiPayload());

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.action, "save_edits");
  assert.deepEqual([...body.saved_fields].sort(), [...WORLD_FIELDS].sort());

  // The persisted row must reflect the artist's edits.
  const stored = db.world_reports[0];
  assert.deepEqual(stored.mood, { tone: "brooding" });
  assert.deepEqual(stored.motifs, ["rain", "neon"]);
  assert.equal(stored.cinematography, "cinematography — revised by the artist");
  // Untouched columns survive.
  // Provenance is preserved and the edits are recorded on raw_report.
  assert.equal(stored.raw_report.model, "openai/gpt-oss-20b");
  assert.ok(stored.raw_report.edited_at, "edited_at provenance must be recorded");
  assert.deepEqual(stored.raw_report.artist_edits.mood, { tone: "brooding" });
  assert.equal(
    stored.raw_report.artist_edits.cinematography,
    "cinematography — revised by the artist"
  );
  // Regression: embedding the edits must not build a cyclic object graph.
  // That is what made production respond 500 "Converting circular structure".
  JSON.parse(JSON.stringify(stored.raw_report)); // must not throw
  assert.ok(
    !("raw_report" in stored.raw_report.artist_edits),
    "artist_edits must not reference back to the report"
  );
  assert.equal(stored.status, "completed");
  assert.equal(stored.confirmed_at, null);
});

test("save_edits response echoes the saved report so the UI can render it", async () => {
  const { handler } = await bootFunction();
  const response = await patch(handler, uiPayload());
  const body = await response.json();

  assert.ok(body.report, "response must include report");
  assert.equal(body.report.project_id, PROJECT_ID);
  assert.deepEqual(body.report.mood, { tone: "brooding" });
});

test("save_edits logs an auditable confirmation line", async () => {
  const { handler, logs } = await bootFunction();
  await patch(handler, uiPayload());

  const line = logs.find((entry) => entry.includes("save_edits applied"));
  assert.ok(line, `expected a save_edits log line, got: ${JSON.stringify(logs)}`);
  assert.match(line, new RegExp(`"project_id":"${PROJECT_ID}"`));
});

test("save_edits also accepts the world_json payload shape", async () => {
  const { handler, db } = await bootFunction();
  const response = await patch(
    handler,
    { projectId: PROJECT_ID, action: "save_edits", world_json: { mood: { tone: "warm" } } }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(db.world_reports[0].mood, { tone: "warm" });
});

test("save_edits rejects non-world columns instead of silently dropping them", async () => {
  const { handler, db, logs } = await bootFunction();
  const response = await patch(
    handler,
    {
      projectId: PROJECT_ID,
      action: "save_edits",
      world_json: { mood: { tone: "warm" }, status: "failed", confirmed_at: "2999-01-01T00:00:00.000Z" },
    }
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "WORLD_FIELDS_NOT_EDITABLE");
  assert.match(body.error.message, /confirmed_at/);
  assert.match(body.error.message, /status/);
  // Nothing was written and nothing was reported as saved.
  assert.equal(db.world_reports[0].status, "completed");
  assert.equal(db.world_reports[0].confirmed_at, null);
  assert.deepEqual(db.world_reports[0].mood, { tone: "original" });
  assert.ok(!logs.some((entry) => entry.includes("save_edits applied")));
});

test("save_edits cannot silently mutate a confirmed world", async () => {
  const { handler, db } = await bootFunction({ worldOverrides: { confirmed_at: "2026-10-03T01:00:00.000Z" } });
  const response = await patch(handler, uiPayload());

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error.code, "WORLD_ALREADY_CONFIRMED");
  assert.equal(db.world_reports[0].mood.tone, "original");
});

test("a pending World with stale interpretation lineage cannot be edited or confirmed", async () => {
  const { handler, db } = await bootFunction({
    worldOverrides: {
      interpretation_id: "older-interpretation",
      interpretation_source_fingerprint: "a".repeat(64),
    },
  });
  const before = structuredClone(db.world_reports[0]);
  const edit = await patch(handler, uiPayload());
  assert.equal(edit.status, 409);
  assert.equal((await edit.json()).error.code, "WORLD_INTERPRETATION_LINEAGE_CHANGED");
  const confirm = await patch(handler, { projectId: PROJECT_ID, action: "confirm" });
  assert.equal(confirm.status, 409);
  assert.equal((await confirm.json()).error.code, "WORLD_INTERPRETATION_LINEAGE_CHANGED");
  assert.deepEqual(db.world_reports[0], before);
});

test("save_edits requires an existing completed world report", async () => {
  const { handler } = await bootFunction({ worldOverrides: { status: "failed" } });
  const response = await patch(handler, uiPayload());

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "WORLD_NOT_READY");
});

test("save_edits rejects a payload with no editable fields", async () => {
  const { handler } = await bootFunction();
  const response = await patch(handler, { projectId: PROJECT_ID, action: "save_edits", world_json: {} });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "WORLD_EDITS_EMPTY");
});

test("save_edits rejects an oversized field", async () => {
  const { handler } = await bootFunction();
  const response = await patch(
    handler,
    { projectId: PROJECT_ID, action: "save_edits", world_json: { mood: "x".repeat(24001) } }
  );

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "WORLD_EDITS_TOO_LARGE");
});

test("save_edits rejects a non-object payload", async () => {
  const { handler } = await bootFunction();
  const response = await patch(
    handler,
    { projectId: PROJECT_ID, action: "save_edits", world_json: "just a string" }
  );

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "WORLD_EDITS_INVALID");
});

test("save_edits still enforces project ownership", async () => {
  const { handler, db } = await bootFunction({ authUserId: "somebody-else" });
  const response = await patch(handler, uiPayload());

  assert.equal(response.status, 404);
  assert.equal(db.world_reports[0].mood.tone, "original");
});

test("confirm still works after the save_edits change", async () => {
  const { handler, db } = await bootFunction();
  const response = await patch(handler, { projectId: PROJECT_ID, action: "confirm" });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.report.confirmed_at, "confirm must persist confirmed_at");
  assert.equal(db.projects[0].world_report_id, "world-1");
});

test("unknown PATCH actions still return 400", async () => {
  const { handler } = await bootFunction();
  const response = await patch(handler, { projectId: PROJECT_ID, action: "delete_everything" });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_ACTION");
});

test("invalid or expired session returns 401", async () => {
  const { handler, db } = await bootFunction({ authUserId: null });
  const response = await patch(handler, uiPayload());

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
  // WorldPage uses raw fetch, so CORS must be present even on failures.
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://beat-vision-beat-vision.vercel.app");
  assert.equal(db.world_reports[0].mood.tone, "original");
});

test("missing Authorization header returns 401", async () => {
  const { handler, db } = await bootFunction();
  const response = await patch(handler, uiPayload(), { token: null });

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHENTICATED");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://beat-vision-beat-vision.vercel.app");
  assert.equal(db.world_reports[0].mood.tone, "original");
});

test("GET returns the world report for the authenticated owner", async () => {
  const { handler } = await bootFunction();
  const response = await request(handler, { method: "GET" });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.report.id, "world-1");
  assert.equal(body.report.project_id, PROJECT_ID);
  assert.equal(body.report.status, "completed");
  assert.equal(body.report.confirmed_at, null);
});

test("OPTIONS preflight returns the CORS headers WorldPage's raw fetch needs", async () => {
  const { handler } = await bootFunction();
  const response = await request(handler, { method: "OPTIONS", token: null });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://beat-vision-beat-vision.vercel.app");
  const allowed = (response.headers.get("Access-Control-Allow-Headers") || "").toLowerCase();
  assert.match(allowed, /authorization/);
  assert.match(allowed, /content-type/);
});

test("OPTIONS preflight permits the active PR preview origin", async () => {
  const { handler } = await bootFunction();
  const response = await request(handler, { method: "OPTIONS", token: null, origin: PR_PREVIEW_ORIGIN });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), PR_PREVIEW_ORIGIN);
});

test("save_edits cannot leave a completed world with an empty field", async () => {
  const { handler, db } = await bootFunction({ worldOverrides: { atmosphere: null } });
  const response = await patch(handler, {
    projectId: PROJECT_ID,
    action: "save_edits",
    changes: { mood: { tone: "warm" } },
  });

  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.error.code, "WORLD_INCOMPLETE");
  assert.match(body.error.message, /atmosphere/);
  // The rejected edit must not have partially persisted.
  assert.deepEqual(db.world_reports[0].mood, { tone: "original" });
});

test("the same edit can fill an empty field in one request", async () => {
  const { handler, db } = await bootFunction({ worldOverrides: { atmosphere: null } });
  const response = await patch(handler, {
    projectId: PROJECT_ID,
    action: "save_edits",
    changes: { mood: { tone: "warm" }, atmosphere: "wet neon haze" },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([...body.saved_fields].sort(), ["atmosphere", "mood"]);
  assert.equal(db.world_reports[0].atmosphere, "wet neon haze");
  assert.deepEqual(db.world_reports[0].mood, { tone: "warm" });
});

test('unverified language account cannot submit inference or overwrite existing World',async()=>{
 const {handler,db}=await bootFunction();const before=structuredClone(db.world_reports);
 const response=await request(handler,{method:'POST',body:{projectId:PROJECT_ID}});
 assert.equal(response.status,503);assert.equal((await response.json()).error.code,'PROVIDER_COST_UNVERIFIED');
 assert.deepEqual(db.world_reports,before);
});
