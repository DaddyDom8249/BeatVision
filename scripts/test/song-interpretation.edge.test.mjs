import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createStubClientFactory } from "./supabase_stub.mjs";

const FUNCTION_PATH = fileURLToPath(new URL("../../supabase/functions/beatvision-song-interpretation/index.ts", import.meta.url));
const SUPABASE_URL = "https://stub.supabase.co";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const PROJECT_ID = "20000000-0000-4000-8000-000000000002";
const SONG_ID = "20000000-0000-4000-8000-000000000003";
const REVISION = "20000000-0000-4000-8000-000000000004";
const SOURCE = new Uint8Array([1, 3, 3, 7, 9, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]);
const SOURCE_HASH = createHash("sha256").update(SOURCE).digest("hex");
const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';
const JSR_IMPORT = 'import "jsr:@supabase/functions-js/edge-runtime.d.ts";';
const CREATED_DIRS = [];
const ORIGINAL_FETCH = globalThis.fetch;

function makeDb() {
  return {
    projects: [{ id: PROJECT_ID, owner_id: USER_ID, title: "Fixture Project" }],
    songs: [{
      id: SONG_ID, project_id: PROJECT_ID, title: "Fixture Song", artist: "Fixture Artist",
      lyrics: "A line about returning home", creative_direction: "Make the return feel earned.", notes: "Keep the existing note.",
      audio_path: "owner/project/song.wav", audio_revision: REVISION, analysis_status: "completed",
      analysis: { duration_seconds: 12, bpm: 96, key: "A minor", sections: [{ start_time: 0, end_time: 12 }] },
      audio_source_fingerprint: null, audio_source_size: null, audio_source_fingerprinted_at: null,
      current_interpretation_id: null, interpretation_confirmed_at: null,
    }],
    song_interpretations: [],
    song_interpretation_audit_events: [],
  };
}

function interpretationDocument(summary = "A return from tension into resolve.") {
  return {
    summary, themes: ["return", "resolve"], emotional_arc: "Tension opens into resolve.",
    visual_motifs: ["rain on glass"], narrative: "Artist-authored context.",
  };
}

async function boot({ authUserId = USER_ID, providerVerified = false, providerResponse = null, onProviderRequest = null } = {}) {
  const db = makeDb();
  const source = await readFile(FUNCTION_PATH, "utf8");
  assert.ok(source.includes(REMOTE_IMPORT));
  const dir = await mkdtemp(join(tmpdir(), "song-interpretation-"));
  CREATED_DIRS.push(dir);
  await writeFile(join(dir, "supabase_stub.mjs"), "const factory=globalThis.__songInterpretationFactory;export function createClient(url,key){return factory(url,key)}\n");
  await writeFile(join(dir, "function.ts"), source.replace(JSR_IMPORT, "").replace(REMOTE_IMPORT, 'from "./supabase_stub.mjs"'));
  const baseFactory = createStubClientFactory(db);
  let calls = 0;
  globalThis.__songInterpretationFactory = () => {
    const base = baseFactory();
    return {
      ...base,
      storage: { from: () => ({ download: async () => ({ data: new Blob([SOURCE]), error: null }) }) },
      rpc: async (name, args) => {
        calls++;
        const song = db.songs[0];
        if (name === "reserve_bragora_ai_request") {
          assert.equal(args.p_limit, 3);
          return { data: "40000000-0000-4000-8000-000000000002", error: null };
        }
        if (name === "release_bragora_ai_request") return { data: true, error: null };
        if (name === "record_song_source_fingerprint") {
          if (args.p_actor_id !== USER_ID) return { data: null, error: { message: "SONG_NOT_FOUND_OR_FORBIDDEN" } };
          song.audio_source_fingerprint = args.p_source_fingerprint;
          song.audio_source_size = args.p_byte_length;
          song.audio_source_fingerprinted_at = new Date().toISOString();
          db.song_interpretation_audit_events.push({ event_type: "source_fingerprinted" });
          return { data: true, error: null };
        }
        if (name === "song_creative_fingerprint") {
          return { data: createHash("sha256").update(JSON.stringify({
            title: song.title ?? null, artist: song.artist ?? null, lyrics: song.lyrics ?? null,
            creative_direction: song.creative_direction ?? null, notes: song.notes ?? null,
            visual_style_preferences: song.visual_style_preferences ?? null,
            analysis_status: song.analysis_status ?? null, analysis: song.analysis ?? null,
          })).digest("hex"), error: null };
        }
        if (name === "save_song_interpretation_draft") {
          if (args.p_source_type === "ai") {
            const live = {
              title: song.title ?? null, artist: song.artist ?? null, lyrics: song.lyrics ?? null,
              creative_direction: song.creative_direction ?? null, notes: song.notes ?? null,
              visual_style_preferences: song.visual_style_preferences ?? null,
              analysis_status: song.analysis_status ?? null, analysis: song.analysis ?? null,
            };
            const hash = createHash("sha256").update(JSON.stringify(live)).digest("hex");
            if (JSON.stringify(args.p_provenance.source_snapshot) !== JSON.stringify(live) ||
                args.p_provenance.expected_creative_source_fingerprint !== hash) {
              return { data: null, error: { message: "SONG_INTERPRETATION_CREATIVE_SOURCE_STALE" } };
            }
          }
          const version = db.song_interpretations.length + 1;
          db.song_interpretations.forEach((row) => { if (row.status === "draft") row.status = "superseded"; });
          const row = {
            id: `20000000-0000-4000-8000-00000000000${version + 4}`, project_id: PROJECT_ID, song_id: SONG_ID,
            audio_revision: args.p_audio_revision, source_fingerprint: args.p_source_fingerprint,
            version, status: "draft", source_type: args.p_source_type,
            interpretation: args.p_interpretation, evidence: args.p_evidence,
            provider: args.p_provider || null, model: args.p_model || null, provenance: args.p_provenance,
            created_by: USER_ID, confirmed_by: null, confirmed_at: null,
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          };
          db.song_interpretations.push(row);
          db.song_interpretation_audit_events.push({ event_type: "draft_created", interpretation_id: row.id });
          return { data: row, error: null };
        }
        if (name === "confirm_song_interpretation") {
          const row = db.song_interpretations.find((candidate) => candidate.id === args.p_interpretation_id);
          if (!row || row.source_fingerprint !== song.audio_source_fingerprint) return { data: null, error: { message: "SONG_INTERPRETATION_SOURCE_STALE" } };
          db.song_interpretations.forEach((candidate) => { if (candidate.status === "confirmed") candidate.status = "superseded"; });
          row.status = "confirmed"; row.confirmed_by = USER_ID; row.confirmed_at = new Date().toISOString();
          song.current_interpretation_id = row.id; song.interpretation_confirmed_at = row.confirmed_at;
          db.song_interpretation_audit_events.push({ event_type: "confirmed", interpretation_id: row.id });
          return { data: row, error: null };
        }
        throw new Error(`unexpected RPC ${name}`);
      },
    };
  };
  let handler;
  globalThis.Deno = {
    env: { get: (key) => ({
      SUPABASE_URL, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service",
      BRAGORA_GROQ_FREE_VERIFIED: providerVerified ? "true" : "false",
      BRAGORA_INTERPRETATION_ENABLED: providerVerified ? "true" : "false",
      GROQ_FREE_API_KEY: providerVerified ? "fixture-free-key" : "",
      BRAGORA_GROQ_MODEL: "openai/gpt-oss-20b",
      BRAGORA_AI_DAILY_QUOTA: "3",
    })[key] ?? "" },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve() }; },
  };
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) {
      if (!authUserId) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({ id: authUserId }), { status: 200 });
    }
    calls++;
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer fixture-free-key");
    if (onProviderRequest) onProviderRequest(db);
    return new Response(JSON.stringify(providerResponse ?? {
      id: "fixture-request",
      choices: [{ message: { content: JSON.stringify({
        ...interpretationDocument(),
        claims: [{ text: "The song moves from tension into resolve.", confidence: 0.91, evidence_refs: ["signal.duration", "artist.direction"] }],
      }) } }],
    }), { status: 200 });
  };
  await import(pathToFileURL(join(dir, "function.ts")).href);
  return { handler, db, calls: () => calls };
}

function request(handler, body, { token = "valid-token" } = {}) {
  const headers = { "Content-Type": "application/json", Origin: "https://beat-vision-beat-vision.vercel.app" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return handler(new Request(`${SUPABASE_URL}/functions/v1/beatvision-song-interpretation`, { method: "POST", headers, body: JSON.stringify(body) }));
}

test("unverified AI is blocked without provider access while manual fallback computes and saves a server fingerprint", async () => {
  const { handler, db, calls } = await boot();
  const blocked = await request(handler, { projectId: PROJECT_ID, action: "propose" });
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).error.code, "PROVIDER_COST_UNVERIFIED");
  assert.equal(calls(), 1, "only the server fingerprint RPC may run; no provider request is allowed");
  const manual = await request(handler, {
    projectId: PROJECT_ID, action: "save_draft", interpretation: interpretationDocument(),
    evidence: [{ id: "artist.note.1", kind: "artist", reference: "artist_note", excerpt: "A return." }],
    source_fingerprint: "f".repeat(64),
  });
  assert.equal(manual.status, 200);
  const body = await manual.json();
  assert.equal(body.draft.source_type, "manual");
  assert.equal(body.source_fingerprint, SOURCE_HASH, "the server must fingerprint downloaded bytes, never trust a client digest");
  assert.equal(db.songs[0].audio_source_fingerprint, SOURCE_HASH);
  assert.equal(db.songs[0].notes, "Keep the existing note.");
  assert.equal(calls(), 3, "manual save fingerprints once and writes one draft");
});

test("AI proposal requires explicit verification and validates evidence references", async () => {
  const good = await boot({ providerVerified: true });
  const response = await request(good.handler, { projectId: PROJECT_ID, action: "propose" });
  assert.equal(response.status, 200);
  const draft = (await response.json()).draft;
  assert.equal(draft.source_type, "ai");
  assert.deepEqual(draft.interpretation.claims[0].evidence_refs, ["signal.duration", "artist.direction"]);
  assert.equal(good.calls(), 6, "AI proposal should fingerprint, bind creative source, reserve, call mock, save, and release");

  const bad = await boot({ providerVerified: true, providerResponse: {
    choices: [{ message: { content: JSON.stringify({ ...interpretationDocument(), claims: [{ text: "Unsupported", confidence: 1, evidence_refs: ["not-source-evidence"] }] }) } }],
  } });
  const rejected = await request(bad.handler, { projectId: PROJECT_ID, action: "propose" });
  assert.equal(rejected.status, 502);
  assert.equal(bad.db.song_interpretations.length, 0);
});

test("late AI interpretation cannot save after artist edits during provider inference", async () => {
  const { handler, db } = await boot({
    providerVerified: true,
    onProviderRequest: (state) => { state.songs[0].lyrics = "The artist rewrote the entire second verse"; },
  });
  const response = await request(handler, { projectId: PROJECT_ID, action: "propose" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "SONG_INTERPRETATION_SOURCE_STALE");
  assert.equal(db.song_interpretations.length, 0);
});

test("confirmation is owner-bound and explicit", async () => {
  const { handler, db } = await boot();
  const saved = await request(handler, { projectId: PROJECT_ID, action: "save_draft", interpretation: interpretationDocument(), evidence: [] });
  const draft = (await saved.json()).draft;
  const confirmed = await request(handler, { projectId: PROJECT_ID, action: "confirm", interpretation_id: draft.id });
  assert.equal(confirmed.status, 200);
  assert.equal((await confirmed.json()).confirmed, true);
  assert.equal(db.songs[0].current_interpretation_id, draft.id);

  const other = await boot({ authUserId: "20000000-0000-4000-8000-000000000099" });
  const denied = await request(other.handler, { projectId: PROJECT_ID, action: "save_draft", interpretation: interpretationDocument(), evidence: [] });
  assert.equal(denied.status, 404);
  assert.equal(other.db.song_interpretation_audit_events.length, 0);
});

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete globalThis.Deno;
  delete globalThis.__songInterpretationFactory;
  for (const dir of CREATED_DIRS.splice(0)) await rm(dir, { recursive: true, force: true });
});
