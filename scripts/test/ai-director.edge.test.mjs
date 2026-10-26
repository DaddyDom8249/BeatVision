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

async function boot({ confirmed = true, providerVerified = false, authUserId = USER_ID, proposal = null } = {}) {
  const db = makeDb({ confirmed, ownerId: USER_ID });
  db.songs[0].lyrics = "The phone rings and I dread answering. You never answer my call.";
  db.songs[0].analysis.transcript_segments = [{start:0,end:5,text:"The phone rings and I dread answering."},{start:5,end:10,text:"You never answer my call."}];
  db.visual_plans = [{id:"plan",project_id:PROJECT_ID,song_id:SONG_ID,vision_lock_id:"lock",status:"draft"}];
  db.visual_plan_scenes = [{id:"scene",project_id:PROJECT_ID,song_id:SONG_ID,visual_plan_id:"plan",status:"draft",start_time:0,end_time:5,updated_at:"version1",lyric_moment:"",visual_direction:"Approved figure beside a phone.",movement_direction:"subtle",camera_direction:"Camera holds still.",mood:"dread",continuity_notes:"Keep approved wardrobe."}];
  db.vision_locks = [{id:"lock",project_id:PROJECT_ID,song_id:SONG_ID,snapshot:{song:structuredClone(db.songs[0]),characters:[{name:"Approved figure"}],world:{mood:"dread"}}}];
  const source = await readFile(FUNCTION_PATH, "utf8");
  assert.ok(source.includes(REMOTE_IMPORT));
  const dir = await mkdtemp(join(tmpdir(), "ai-director-"));
  CREATED_DIRS.push(dir);
  await writeFile(join(dir, "supabase_stub.mjs"), "const factory=globalThis.__directorFactory;export function createClient(url,key){return factory(url,key)}\n");
  await writeFile(join(dir, "function.ts"), source.replace(REMOTE_IMPORT, 'from "./supabase_stub.mjs"'));

  let handler;
  const providerCalls = [], quotaCalls = [];
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
      quotaCalls.push(name);
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
    return new Response(JSON.stringify({ choices: [{ message: { content: proposal ? JSON.stringify(proposal) : "Use the confirmed return arc as a gradual visual opening." } }] }), { status: 200 });
  };
  await import(pathToFileURL(join(dir, "function.ts")).href);
  return { handler, db, providerCalls, quotaCalls };
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
  assert.deepEqual(body.evidence_ids, ["signal.duration"]);
  assert.equal(providerCalls.length, 1);
  const providerBody = JSON.parse(providerCalls[0].options.body);
  assert.match(providerBody.messages[1].content, /confirmed_interpretation/);
  assert.match(providerBody.messages[1].content, /How should the emotional turn/);
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

const phoneProposal = {lyric_excerpt:"The phone rings and I dread answering.",mode:"literal",action:"The phone vibrates as the figure hesitates, shoulders tense with dread.",objects:["phone"],emotion:"dread",visual_direction:"A visible phone on the table beside the approved figure, tense expression and cool lighting.",camera:"Camera holds still.",meaning:"Dread of answering the ringing phone.",uncertainty:"AI interpretation; artist review required."};
const sceneRequest = {projectId:PROJECT_ID,action:"propose_scene",scene_id:"scene",mode:"literal"};
test("lyric proposal uses only this scene's timestamped words, concrete objects and emotional action without writing", async()=>{
 const f=await boot({providerVerified:true,proposal:phoneProposal}); const before=structuredClone(f.db);
 const response=await request(f.handler,sceneRequest);assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.scene_proposal.action,phoneProposal.action);assert.equal(body.timing.source,"transcript_segments");
 assert.deepEqual(body.timing.segments,[{start:0,end:5,text:phoneProposal.lyric_excerpt}]);assert.deepEqual(f.db,before);
 const source=JSON.parse(f.providerCalls[0].options.body);assert.match(source.messages[0].content,/negat|figurative/i);
 assert.match(source.messages[1].content,/phone rings/); assert.doesNotMatch(source.messages[1].content,/You never answer my call/);
});
test("lyric proposal denies foreign, locked and stale song/scene lineage before inference",async()=>{
 for(const mutation of [db=>db.visual_plans[0].status="approved",db=>db.visual_plan_scenes[0].project_id="foreign",db=>db.vision_locks[0].snapshot.song.audio_revision="old"]){
 const f=await boot({providerVerified:true,proposal:phoneProposal});mutation(f.db);const response=await request(f.handler,sceneRequest);assert.ok(response.status>=400);assert.equal(f.providerCalls.length,0);
 }
});
test("untimed lyrics require explicit artist assignment and never invent timestamps",async()=>{
 let f=await boot({providerVerified:true,proposal:phoneProposal});f.db.songs[0].analysis.transcript_segments=[];
 let response=await request(f.handler,sceneRequest);assert.equal(response.status,422);assert.equal(f.providerCalls.length,0);
 response=await request(f.handler,{...sceneRequest,lyric_excerpt:phoneProposal.lyric_excerpt,confirm_assignment:true});assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.timing.source,"artist_assigned");assert.deepEqual(body.timing.segments,[]);
});
test("reject invented quotes, wrong mode, generic action and incomplete model output; release quota",async()=>{
 for(const patch of [{lyric_excerpt:"A spaceship lands"},{mode:"symbolic"},{action:"subtle gestures, restrained"},{objects:[]},{emotion:""}]){
 const f=await boot({providerVerified:true,proposal:{...phoneProposal,...patch}});const response=await request(f.handler,sceneRequest);assert.equal(response.status,502);assert.equal(f.providerCalls.length,1);assert.equal(f.quotaCalls.at(-1),"release_bragora_ai_request");
 }
});
test("artist lyrics override conflicting machine transcript; symbolism is an explicit choice",async()=>{
 const symbolic={...phoneProposal,lyric_excerpt:"You never answer my call.",mode:"symbolic",objects:["closed doorway"],action:"The approved figure waits at a closed doorway, shoulders lowered in rejection."};
 const f=await boot({providerVerified:true,proposal:symbolic});f.db.songs[0].analysis.transcript_segments[1].text="Incorrect machine words";f.db.visual_plan_scenes[0].start_time=5;f.db.visual_plan_scenes[0].end_time=10;
 let response=await request(f.handler,{...sceneRequest,mode:"symbolic"});assert.equal(response.status,422);assert.equal(f.providerCalls.length,0);
 response=await request(f.handler,{...sceneRequest,mode:"symbolic",lyric_excerpt:symbolic.lyric_excerpt,confirm_assignment:true});assert.equal(response.status,200);
 assert.equal((await response.json()).timing.source,"artist_assigned");
});

test("word timestamps narrow the scene to its own words rather than copying a long segment",async()=>{
 const p={...phoneProposal,lyric_excerpt:"The phone rings"};const f=await boot({providerVerified:true,proposal:p});
 f.db.songs[0].analysis.word_timestamps=[{start:0,end:0.4,word:"The"},{start:0.4,end:0.9,word:"phone"},{start:0.9,end:1.4,word:"rings"},{start:5,end:6,word:"elsewhere"}];
 const response=await request(f.handler,sceneRequest);assert.equal(response.status,200);const body=await response.json();
 assert.equal(body.timing.source,"word_timestamps");assert.equal(body.scene_proposal.lyric_excerpt,"The phone rings");
 assert.equal(body.timing.segments.length,3);
});
test("scene proposal keeps owner/free/quota guards and rejects missing mode or altered saved lyric claims",async()=>{
 const f=await boot({providerVerified:false,proposal:phoneProposal});let r=await request(f.handler,sceneRequest);assert.equal(r.status,503);assert.equal(f.providerCalls.length,0);
 r=await request(f.handler,{...sceneRequest,mode:""});assert.equal(r.status,400);
 r=await request(f.handler,sceneRequest,null);assert.equal(r.status,401);
 r=await request(f.handler,{...sceneRequest,lyric_excerpt:"Invented phone lyrics",confirm_assignment:true});assert.equal(r.status,422);
 assert.equal(f.providerCalls.length,0);
});
