import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStubClientFactory } from "./supabase_stub.mjs";

const FUNCTION_PATH = fileURLToPath(new URL("../../supabase/functions/beatvision-ai-director/index.ts", import.meta.url));
const SUPABASE_URL = "https://stub.supabase.co";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "30000000-0000-4000-8000-000000000099";
const PROJECT_ID = "30000000-0000-4000-8000-000000000002";
const SONG_ID = "30000000-0000-4000-8000-000000000003";
const REVISION = "30000000-0000-4000-8000-000000000004";
const INTERPRETATION_ID = "30000000-0000-4000-8000-000000000005";
const FINGERPRINT = "d".repeat(64);
const REMOTE_IMPORT = 'from "https://esm.sh/@supabase/supabase-js@2"';
const CREATED_DIRS = [];
const ORIGINAL_FETCH = globalThis.fetch;

function makeDb({ confirmed = true, ownerId = USER_ID } = {}) {
  const interpretation = {
    id: INTERPRETATION_ID, song_id: SONG_ID, audio_revision: REVISION,
    source_fingerprint: FINGERPRINT, creative_source_fingerprint: "e".repeat(64), status: confirmed ? "confirmed" : "draft", version: 2,
    interpretation: { schema_version: 1, summary: "Tension resolves through return." },
    evidence: [{ id: "signal.duration", kind: "signal", reference: "analysis.duration_seconds", value: 42 }],
    confirmed_at: confirmed ? "2026-10-20T00:00:00.000Z" : null,
  };
  return {
    projects: [{ id: PROJECT_ID, owner_id: ownerId }],
    songs: [{
      id: SONG_ID, project_id: PROJECT_ID, title: "Return", artist: "Artist", lyrics: "I return",
      creative_direction: "Keep the turn earned.", analysis: { duration_seconds: 42 }, audio_revision: REVISION,
      audio_source_fingerprint: confirmed ? FINGERPRINT : null,
      current_interpretation_id: confirmed ? INTERPRETATION_ID : null,
      interpretation_confirmed_at: confirmed ? interpretation.confirmed_at : null,
    }],
    song_interpretations: confirmed ? [interpretation] : [{ ...interpretation, status: "draft" }],
  };
}

async function boot({ confirmed = true, providerVerified = false, authUserId = USER_ID, providerOutput = { answer: "Use the confirmed return arc as a gradual visual opening.", evidence_refs: ["confirmed.interpretation"] } } = {}) {
  const db = makeDb({ confirmed, ownerId: USER_ID });
  const source = await readFile(FUNCTION_PATH, "utf8");
  assert.ok(source.includes(REMOTE_IMPORT));
  const dir = await mkdtemp(join(tmpdir(), "ai-director-"));
  CREATED_DIRS.push(dir);
  await writeFile(join(dir, "supabase_stub.mjs"), "const factory=globalThis.__directorFactory;export function createClient(url,key){return factory(url,key)}\n");
  await writeFile(join(dir, "function.ts"), source.replace(REMOTE_IMPORT, 'from "./supabase_stub.mjs"'));

  let handler;
  const providerCalls = [];
  globalThis.Deno = {
    env: { get: (key) => ({
      SUPABASE_URL, SUPABASE_ANON_KEY: "stub-anon", SUPABASE_SERVICE_ROLE_KEY: "stub-service",
      BRAGORA_GROQ_FREE_VERIFIED: providerVerified ? "true" : "false",
      BRAGORA_AI_DIRECTOR_ENABLED: providerVerified ? "true" : "false",
      GROQ_FREE_API_KEY: providerVerified ? "fixture-free-key" : "",
      BRAGORA_GROQ_MODEL: "openai/gpt-oss-20b",
      BRAGORA_AI_DAILY_QUOTA: "2",
    })[key] ?? "" },
    serve: (fn) => { handler = fn; return { finished: Promise.resolve() }; },
  };
  globalThis.__directorFactory = () => ({
    ...createStubClientFactory(db)(),
    rpc: async (name, args) => {
      if (name === "song_creative_fingerprint") return { data: "e".repeat(64), error: null };
      if (name === "reserve_bragora_ai_request") {
        assert.equal(args.p_limit, 2);
        return { data: "40000000-0000-4000-8000-000000000001", error: null };
      }
      if (name === "release_bragora_ai_request") return { data: true, error: null };
      throw new Error("Unexpected RPC " + name);
    },
  });
  globalThis.fetch = async (input, options) => {
    if (String(input).endsWith("/auth/v1/user")) return new Response(JSON.stringify({ id: authUserId }), { status: 200 });
    providerCalls.push({ input: String(input), options });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(providerOutput) } }] }), { status: 200 });
  };
  await import(pathToFileURL(join(dir, "function.ts")).href);
  return { handler, db, providerCalls };
}

function request(handler, body, token = "valid-token") {
  const headers = { "Content-Type": "application/json", Origin: "https://beat-vision-beat-vision.vercel.app" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return handler(new Request(`${SUPABASE_URL}/functions/v1/beatvision-ai-director`, { method: "POST", headers, body: JSON.stringify(body) }));
}

test("Director is gated by a current confirmed interpretation before provider eligibility is considered", async () => {
  const { handler, providerCalls } = await boot({ confirmed: false, providerVerified: true });
  const response = await request(handler, { projectId: PROJECT_ID, songId: SONG_ID, question: "What should open first?" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "DIRECTOR_INTERPRETATION_REQUIRED");
  assert.equal(providerCalls.length, 0);
});

test("unverified Director chat blocks external inference even with confirmed lineage", async () => {
  const { handler, providerCalls } = await boot();
  const response = await request(handler, { projectId: PROJECT_ID, songId: SONG_ID, question: "What should open first?" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "PROVIDER_COST_UNVERIFIED");
  assert.equal(providerCalls.length, 0);
});

test("verified Director mock receives server-confirmed lineage and returns an answer", async () => {
  const { handler, providerCalls } = await boot({ providerVerified: true });
  const response = await request(handler, { projectId: PROJECT_ID, songId: SONG_ID, question: "How should the emotional turn become a transition?" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, "Use the confirmed return arc as a gradual visual opening.");
  assert.equal(body.interpretation_id, INTERPRETATION_ID);
  assert.deepEqual(body.evidence_ids, ["confirmed.interpretation"]);
  assert.equal(providerCalls.length, 1);
  const providerBody = JSON.parse(providerCalls[0].options.body);
  assert.match(providerBody.messages[1].content, /confirmed_interpretation/);
  assert.match(providerBody.messages[1].content, /How should the emotional turn/);
  assert.deepEqual(providerBody.response_format, { type: "json_object" });
});

test("Director rejects fabricated evidence references and never labels all sources as cited", async () => {
  const { handler, providerCalls } = await boot({
    providerVerified: true,
    providerOutput: { answer: "Invented detail.", evidence_refs: ["fabricated.fact"] },
  });
  const response = await request(handler, { projectId: PROJECT_ID, songId: SONG_ID, question: "What supports this scene?" });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "DIRECTOR_PROVIDER_INVALID");
  assert.equal(providerCalls.length, 1);
});

test("Director rejects an uncited output instead of implying the artist approved it", async () => {
  const { handler, providerCalls } = await boot({
    providerVerified: true,
    providerOutput: { answer: "Unattributed advice.", evidence_refs: [] },
  });
  const response = await request(handler, { projectId: PROJECT_ID, songId: SONG_ID, question: "Why this direction?" });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "DIRECTOR_PROVIDER_INVALID");
  assert.equal(providerCalls.length, 1);
});

test("Director remains owner-bound", async () => {
  const { handler, providerCalls } = await boot({ providerVerified: true, authUserId: OTHER_USER_ID });
  const response = await request(handler, { projectId: PROJECT_ID, songId: SONG_ID, question: "What should open first?" });
  assert.equal(response.status, 404);
  assert.equal(providerCalls.length, 0);
});

after(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete globalThis.Deno;
  delete globalThis.__directorFactory;
  for (const dir of CREATED_DIRS.splice(0)) await rm(dir, { recursive: true, force: true });
});
