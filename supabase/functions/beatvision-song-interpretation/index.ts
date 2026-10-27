function trustedStudioOrigin(
  origin: string | null,
  productionOrigins: ReadonlySet<string>,
  previewConfig: string | null = null,
): string | null {
  if (!origin) return null;
  if (productionOrigins.has(origin)) return origin;
  const config = previewConfig || "";
  if (!config || config.length > 2048) return null;
  const candidates = config.split(",").map((value) => value.trim()).filter(Boolean);
  if (candidates.length > 8 || candidates.length === 0) return null;
  for (const candidate of candidates) {
    // Explicit exact preview hostname, belonging to the verified BeatVision
    // Vercel deployment namespace; no generic *.vercel.app trust.
    if (!/^https:\/\/beat-vision-[a-z0-9-]{6,140}-beat-vision\.vercel\.app$/.test(candidate))
      return null;
    try {
      const parsed = new URL(candidate);
      if (parsed.origin !== candidate || parsed.pathname !== "/" || parsed.search ||
          parsed.hash || parsed.username || parsed.password || parsed.port) return null;
    } catch { return null; }
  }
  return candidates.includes(origin) ? origin : null;
}


import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Song Intelligence is deliberately separate from the existing transcription
// function. It can persist an artist-authored fallback without any model call,
// while AI proposals remain disabled until the provider's no-charge status is
// explicitly verified by configuration.
const ALLOWED_ORIGINS = new Set([
  "https://beat-vision-kfk4sh067-beat-vision.vercel.app",
  "https://beat-vision-theta.vercel.app",
  "https://beat-vision-beat-vision.vercel.app",
  "https://beat-vision-git-main-beat-vision.vercel.app",
  "https://beat-vision-git-fix-style-description-genera-790bfa-beat-vision.vercel.app",
  "https://beat-vision-f8nn-git-fix-style-description-g-a4cacb-beat-vision.vercel.app",
]);

const MAX_BODY_BYTES = 256 * 1024;
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_TEXT = 2400;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  const permitted = trustedStudioOrigin(origin, ALLOWED_ORIGINS, Deno.env.get("BEATVISION_ALLOWED_PREVIEW_ORIGINS"));
  if (permitted) headers["Access-Control-Allow-Origin"] = permitted;
  return headers;
}

const env = (name: string) => String(Deno.env.get(name) || "").trim();

class HttpError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

async function readJsonBody(req: Request): Promise<Record<string, any>> {
  const declared = req.headers.get("Content-Length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new HttpError("REQUEST_TOO_LARGE", 413, "Request body is too large.");
  }
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new HttpError("REQUEST_TOO_LARGE", 413, "Request body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  } catch {
    throw new HttpError("REQUEST_JSON_INVALID", 400, "Request body must be valid JSON.");
  }
}

async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError("UNAUTHENTICATED", 401, "Authentication required.");
  const response = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: {
      apikey: env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"),
      Authorization: "Bearer " + token,
    },
  });
  if (!response.ok) throw new HttpError("UNAUTHENTICATED", 401, "Invalid or expired authentication session.");
  const user = await response.json();
  if (!user?.id) throw new HttpError("UNAUTHENTICATED", 401, "Authenticated user could not be established.");
  return String(user.id);
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

function boundedSignal(raw: unknown): Record<string, unknown> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, any> : {};
  const keep = ["duration_seconds", "bpm", "bpm_confidence", "key", "key_confidence", "time_signature", "transcription_status"];
  const summary: Record<string, unknown> = {};
  for (const key of keep) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) summary[key] = value;
    else if (typeof value === "string") summary[key] = value.slice(0, 120);
  }
  if (Array.isArray(source.sections)) summary.sections = source.sections.slice(0, 12).map((section: any) => ({
    start_time: section?.start_time ?? null, end_time: section?.end_time ?? null,
  }));
  if (typeof source.transcript === "string") summary.transcript = source.transcript.slice(0, 800);
  return summary;
}

function clean(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function lines(value: unknown, maxItems = 16, maxChars = 360): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => clean(item, maxChars)).filter(Boolean).slice(0, maxItems);
  }
  return clean(value, maxItems * maxChars)
    .split(/\r?\n|\s*;\s*/)
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sha256Hex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest("SHA-256", bytes).then((digest) =>
    Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("")
  );
}

async function reserveRequest(admin: any, projectId: string, userId: string, operation: "director" | "interpretation") {
  const daily = Number(env("BRAGORA_AI_DAILY_QUOTA"));
  if (!Number.isInteger(daily) || daily < 1 || daily > 20) {
    throw new HttpError("PROVIDER_COST_UNVERIFIED", 503, "A bounded daily inference quota is required.");
  }
  const { data, error } = await admin.rpc("reserve_bragora_ai_request", {
    p_project_id: projectId, p_actor_id: userId, p_operation: operation, p_limit: daily,
  });
  if (error || typeof data !== "string") {
    throw new HttpError("AI_QUOTA_OR_CONCURRENCY_BLOCKED", 429, "The daily AI limit is reached or another request is in progress.");
  }
  return data;
}

async function releaseRequest(admin: any, projectId: string, userId: string, operation: "director" | "interpretation", ticket: string) {
  const { error } = await admin.rpc("release_bragora_ai_request", {
    p_project_id: projectId, p_actor_id: userId, p_operation: operation, p_ticket: ticket,
  });
  if (error) console.error("bragora-ai-quota-release-failed", operation);
}

function asBytes(value: unknown): Promise<Uint8Array> {
  if (value instanceof Uint8Array) return Promise.resolve(value);
  if (value instanceof ArrayBuffer) return Promise.resolve(new Uint8Array(value));
  if (value && typeof (value as any).arrayBuffer === "function") {
    return (value as any).arrayBuffer().then((buffer: ArrayBuffer) => new Uint8Array(buffer));
  }
  throw new HttpError("SONG_SOURCE_UNREADABLE", 502, "The saved audio could not be read for source verification.");
}

async function readStoredAudio(admin: any, path: string): Promise<Uint8Array> {
  const result = await admin.storage.from("songs").download(path);
  if (result.error || !result.data) {
    throw new HttpError("SONG_SOURCE_UNREADABLE", 502, "The saved audio could not be read for source verification.");
  }
  const bytes = await asBytes(result.data);
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_AUDIO_BYTES) {
    throw new HttpError("SONG_SOURCE_SIZE_INVALID", 422, "The saved audio is outside the supported source-size limit.");
  }
  return bytes;
}

async function fingerprintSong(admin: any, song: Record<string, any>) {
  if (!song.audio_path || !song.audio_revision) {
    throw new HttpError("SONG_AUDIO_REQUIRED", 422, "Save an audio track before creating an interpretation.");
  }
  const bytes = await readStoredAudio(admin, String(song.audio_path));
  return { fingerprint: await sha256Hex(bytes), byteLength: bytes.byteLength };
}

function sourceEvidence(song: Record<string, any>, fingerprint: string) {
  const analysis = song.analysis && typeof song.analysis === "object" ? song.analysis : {};
  return [
    { id: "signal.duration", kind: "signal", reference: "analysis.duration_seconds", value: analysis.duration_seconds ?? null },
    { id: "signal.bpm", kind: "signal", reference: "analysis.bpm", value: analysis.bpm ?? null },
    { id: "signal.key", kind: "signal", reference: "analysis.key", value: analysis.key ?? null },
    { id: "signal.sections", kind: "signal", reference: "analysis.sections", value: Array.isArray(analysis.sections) ? analysis.sections : [] },
    { id: "lyrics.full", kind: "lyrics", reference: "songs.lyrics", excerpt: clean(song.lyrics, 5000) || null },
    { id: "lyrics.transcript", kind: "lyrics", reference: "analysis.transcript", excerpt: clean(analysis.transcript, 5000) || null },
    { id: "artist.direction", kind: "artist", reference: "songs.creative_direction", excerpt: clean(song.creative_direction, 1200) || null },
    { id: "artist.notes", kind: "artist", reference: "songs.notes", excerpt: clean(song.notes, 1200) || null },
    { id: "artist.style", kind: "artist", reference: "songs.visual_style_preferences", excerpt: clean(JSON.stringify(song.visual_style_preferences ?? {}), 1200) },
    { id: "source.fingerprint", kind: "signal", reference: "server.sha256", value: fingerprint },
  ];
}

function normaliseManual(value: unknown, evidenceValue: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
  const summary = clean(input.summary ?? value, MAX_TEXT);
  if (!summary) throw new HttpError("SONG_INTERPRETATION_EMPTY", 400, "Add an interpretation summary before saving the draft.");
  const themes = lines(input.themes ?? input.themes_text);
  const visualMotifs = lines(input.visual_motifs ?? input.visual_motifs_text);
  const emotionalArc = clean(input.emotional_arc ?? input.emotional_arc_text, 1200);
  const narrative = clean(input.narrative ?? input.narrative_text, 1200);
  const evidence = Array.isArray(evidenceValue)
    ? evidenceValue.slice(0, 32).map((item, index) => {
      const row = item && typeof item === "object" ? item as Record<string, any> : {};
      return {
        id: clean(row.id, 80) || `artist.note.${index + 1}`,
        kind: ["signal", "lyrics", "artist", "manual"].includes(row.kind) ? row.kind : "manual",
        reference: clean(row.reference, 160) || "artist_authored_note",
        excerpt: clean(row.excerpt ?? row.text, 800),
      };
    }).filter((item) => item.excerpt)
    : [];
  if (!evidence.length) {
    evidence.push({ id: "artist.interpretation", kind: "artist", reference: "artist_authored_interpretation", excerpt: summary.slice(0, 800) });
  }
  return {
    interpretation: {
      schema_version: 1,
      summary,
      themes,
      emotional_arc: emotionalArc,
      visual_motifs: visualMotifs,
      narrative,
      claims: [{ text: summary, confidence: "artist_authored", evidence_refs: evidence.map((item) => item.id) }],
    },
    evidence,
  };
}

function parseModelJson(content: string): any {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(trimmed); } catch { throw new HttpError("INTERPRETATION_PROVIDER_INVALID", 502, "The interpretation provider returned invalid JSON."); }
}

function validateAiInterpretation(value: unknown, evidence: Array<Record<string, any>>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError("INTERPRETATION_PROVIDER_INVALID", 502, "The interpretation provider returned an invalid object.");
  }
  const input = value as Record<string, any>;
  const summary = clean(input.summary, MAX_TEXT);
  const claims = Array.isArray(input.claims) ? input.claims.slice(0, 24) : [];
  const allowed = new Set(evidence.map((item) => item.id));
  if (!summary || claims.length === 0) {
    throw new HttpError("INTERPRETATION_EVIDENCE_REQUIRED", 502, "The interpretation provider returned no evidence-linked claims.");
  }
  const safeClaims = claims.map((claim) => {
    if (!claim || typeof claim !== "object") throw new HttpError("INTERPRETATION_EVIDENCE_REQUIRED", 502, "Every interpretation claim must cite evidence.");
    const text = clean(claim.text, 600);
    const refs = Array.isArray(claim.evidence_refs) ? claim.evidence_refs.map((ref: unknown) => clean(ref, 80)).filter(Boolean) : [];
    if (!text || refs.length === 0 || refs.some((ref: string) => !allowed.has(ref))) {
      throw new HttpError("INTERPRETATION_EVIDENCE_REQUIRED", 502, "Every interpretation claim must cite known song evidence.");
    }
    const confidence = Number(claim.confidence);
    const qualifiedText = refs.some((ref: string) => ["signal.bpm", "signal.key", "signal.sections"].includes(ref))
      ? clean("Estimate: " + text, 600)
      : text;
    return { text: qualifiedText, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null, evidence_refs: refs };
  });
  const themes = lines(input.themes);
  const emotionalArc = clean(input.emotional_arc, 1200);
  const visualMotifs = lines(input.visual_motifs);
  const narrative = clean(input.narrative, 1200);
  if (!themes.length || !emotionalArc || !visualMotifs.length || !narrative) {
    throw new HttpError("INTERPRETATION_INCOMPLETE", 502, "The AI returned an incomplete interpretation. Your analysis is saved; retry Propose AI Interpretation to create a complete draft.");
  }
  return {
    schema_version: 1,
    summary,
    themes,
    emotional_arc: emotionalArc,
    visual_motifs: visualMotifs,
    narrative,
    claims: safeClaims,
  };
}

async function loadProjectSong(admin: any, projectId: string, userId: string) {
  const projectResult = await admin.from("projects")
    .select("id,owner_id,title")
    .eq("id", projectId)
    .maybeSingle();
  if (projectResult.error) throw new Error(projectResult.error.message);
  if (!projectResult.data || projectResult.data.owner_id !== userId) {
    throw new HttpError("NOT_FOUND", 404, "Project not found.");
  }
  const songResult = await admin.from("songs")
    .select("id,project_id,title,artist,lyrics,creative_direction,notes,visual_style_preferences,audio_path,audio_revision,analysis_status,analysis,audio_source_fingerprint,audio_source_size,audio_source_fingerprinted_at,current_interpretation_id,interpretation_confirmed_at")
    .eq("project_id", projectId)
    .maybeSingle();
  if (songResult.error) throw new Error(songResult.error.message);
  if (!songResult.data) throw new HttpError("SONG_NOT_FOUND", 404, "Song not found.");
  return { project: projectResult.data, song: songResult.data };
}

async function persistFingerprint(admin: any, projectId: string, song: Record<string, any>, userId: string) {
  const source = await fingerprintSong(admin, song);
  const result = await admin.rpc("record_song_source_fingerprint", {
    p_project_id: projectId,
    p_song_id: song.id,
    p_actor_id: userId,
    p_audio_revision: song.audio_revision,
    p_source_fingerprint: source.fingerprint,
    p_byte_length: source.byteLength,
  });
  if (result.error) {
    const message = String(result.error.message || "");
    if (message.includes("REVISION")) throw new HttpError("SONG_AUDIO_REVISION_CHANGED", 409, "The audio changed while the source was being verified. Reload and retry.");
    throw new Error(message || "Source fingerprint could not be saved.");
  }
  return source;
}

async function saveDraft(admin: any, projectId: string, song: Record<string, any>, userId: string, input: any, sourceType: "manual" | "artist_edited" | "ai", metadata: Record<string, any> = {}, knownSource?: { fingerprint: string; byteLength: number }) {
  const source = knownSource || await persistFingerprint(admin, projectId, song, userId);
  const normalised = sourceType === "ai"
    ? { interpretation: input.interpretation, evidence: input.evidence }
    : normaliseManual(input.interpretation, input.evidence);
  const result = await admin.rpc("save_song_interpretation_draft", {
    p_project_id: projectId,
    p_song_id: song.id,
    p_actor_id: userId,
    p_audio_revision: song.audio_revision,
    p_source_fingerprint: source.fingerprint,
    p_interpretation: normalised.interpretation,
    p_evidence: normalised.evidence,
    p_source_type: sourceType,
    p_provider: metadata.provider || "",
    p_model: metadata.model || "",
    p_provenance: {
      ...metadata,
      source_fingerprint: source.fingerprint,
      audio_revision: song.audio_revision,
      generated_at: new Date().toISOString(),
    },
  });
  if (result.error) {
    const message = String(result.error.message || "");
    if (message.includes("STALE") || message.includes("REVISION")) throw new HttpError("SONG_INTERPRETATION_SOURCE_STALE", 409, "The audio changed while this draft was being saved. Reload and retry.");
    throw new Error(message || "Interpretation draft could not be saved.");
  }
  return { draft: result.data, source };
}

async function proposeAi(admin: any, projectId: string, song: Record<string, any>, userId: string) {
  const source = await persistFingerprint(admin, projectId, song, userId);
  const verified = env("BRAGORA_GROQ_FREE_VERIFIED") === "true";
  const key = env("GROQ_FREE_API_KEY");
  const url = "https://api.groq.com/openai/v1/chat/completions";
  const model = "openai/gpt-oss-20b";
  if (!verified || env("BRAGORA_INTERPRETATION_ENABLED") !== "true" || !key
      || env("BRAGORA_GROQ_MODEL") !== model) {
    return { unavailable: true, source };
  }
  const evidence = sourceEvidence(song, source.fingerprint);
  const system = [
    "You are the BragoraForge Song Intelligence director.",
    "Return JSON only with summary, themes, emotional_arc, visual_motifs, narrative, and claims.",
    "Fill every section with an editable first draft: summary, emotional_arc and narrative are nonempty strings; themes and visual_motifs are nonempty arrays of strings; claims is a nonempty array of text, confidence and evidence_refs.",
    "Artist lyrics and creative direction are authoritative. The machine transcript may contain errors; prefer artist lyrics when they are provided.",
    "Visual motifs and narrative are proposed creative suggestions, not claims about events in the song. Label those suggestions clearly.",
    "Every claim must include evidence_refs containing only IDs supplied in the source evidence.",
    "Tempo, musical key and structural regions are heuristic estimates; describe them as estimates rather than verified musical facts. Duration is measured.",
    "Do not invent lyrics, genre, instruments, biography, identity, or events absent from evidence.",
    "When evidence is insufficient, put an explicit uncertainty statement in that section instead of leaving it blank. Do not invent song facts to fill a section.",
  ].join(" ");
  const ticket = await reserveRequest(admin, projectId, userId, "interpretation");
  try {
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, {
        role: "user",
        content: JSON.stringify({
          song: { title: song.title, artist: song.artist, lyrics: clean(song.lyrics, 5000), creative_direction: clean(song.creative_direction, 1600), notes: clean(song.notes, 1600), visual_style_preferences: song.visual_style_preferences ?? {} },
          analysis: boundedSignal(song.analysis),
          source_fingerprint: source.fingerprint,
          evidence,
        }),
      }],
    }),
  });
  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) throw new HttpError("INTERPRETATION_PROVIDER_FAILED", 503, "The verified interpretation provider is unavailable. Manual interpretation remains available.");
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new HttpError("INTERPRETATION_PROVIDER_INVALID", 502, "The interpretation provider returned no proposal.");
  const interpretation = validateAiInterpretation(parseModelJson(content), evidence);
  return saveDraft(admin, projectId, song, userId, { interpretation, evidence }, "ai", {
    provider: "verified-free-provider",
    model,
    provider_request_id: data?.id || null,
  }, source);
  } finally {
    await releaseRequest(admin, projectId, userId, "interpretation", ticket);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    const userId = await getUser(req);
    const projectId = new URL(req.url).searchParams.get("projectId") || "";
    const body = req.method === "GET" ? {} : await readJsonBody(req);
    const resolvedProjectId = String(body.projectId || projectId || "").trim();
    if (!resolvedProjectId) throw new HttpError("PROJECT_REQUIRED", 400, "projectId is required.");
    const admin = adminClient();
    const { song } = await loadProjectSong(admin, resolvedProjectId, userId);

    async function listVersions() {
      const versions = await admin.from("song_interpretations")
        .select("id,song_id,project_id,audio_revision,source_fingerprint,source_fingerprint_algorithm,version,status,source_type,interpretation,evidence,provider,model,provenance,created_by,confirmed_by,confirmed_at,created_at,updated_at")
        .eq("song_id", song.id)
        .order("version", { ascending: false });
      if (versions.error) throw new Error(versions.error.message);
      return { song, drafts: versions.data || [], current_interpretation_id: song.current_interpretation_id };
    }

    if (req.method === "GET") {
      return json(req, await listVersions());
    }
    if (req.method !== "POST") throw new HttpError("METHOD_NOT_ALLOWED", 405, "POST required.");

    const action = String(body.action || "");
    if (action === "get") return json(req, await listVersions());
    if (action === "save_draft") {
      const result = await saveDraft(admin, resolvedProjectId, song, userId, {
        interpretation: body.interpretation,
        evidence: body.evidence,
      }, body.source_type === "artist_edited" ? "artist_edited" : "manual");
      return json(req, { draft: result.draft, source_fingerprint: result.source.fingerprint, status: "draft" });
    }
    if (action === "propose") {
      if (body.audioRevision !== undefined && body.audioRevision !== song.audio_revision) {
        throw new HttpError("SONG_AUDIO_REVISION_CHANGED", 409, "The audio changed after analysis. Reload and analyze the saved track before generating its interpretation.");
      }
      if (body.only_if_empty === true) {
        const versions = await listVersions();
        const active = versions.drafts.find((draft: any) => draft.audio_revision === song.audio_revision &&
          (draft.status === "draft" || (draft.status === "confirmed" && draft.id === song.current_interpretation_id)));
        if (active) return json(req, { draft: active, status: active.status, reused_existing: true });
      }
      const result = await proposeAi(admin, resolvedProjectId, song, userId);
      if (result.unavailable) {
        return json(req, {
          error: { code: "PROVIDER_COST_UNVERIFIED", message: "AI interpretation is unavailable until a no-charge provider is verified. Manual interpretation editing remains available." },
          manual_fallback: true,
          source_fingerprint: result.source.fingerprint,
        }, 503);
      }
      return json(req, { draft: result.draft, source_fingerprint: result.source.fingerprint, status: "draft" });
    }
    if (action === "confirm") {
      const interpretationId = String(body.interpretation_id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(interpretationId)) throw new HttpError("INTERPRETATION_REQUIRED", 400, "Choose an interpretation draft to confirm.");
      // A replaced object at the same path must not be confirmed using a stale
      // server-recorded digest, even before the restrictive storage policy is deployed.
      const currentAudio = await fingerprintSong(admin, song);
      if (currentAudio.fingerprint !== song.audio_source_fingerprint) {
        throw new HttpError("SONG_AUDIO_CHANGED", 409, "The saved audio bytes have changed. Upload a new revision before confirmation.");
      }
      const result = await admin.rpc("confirm_song_interpretation", {
        p_project_id: resolvedProjectId,
        p_song_id: song.id,
        p_interpretation_id: interpretationId,
        p_actor_id: userId,
      });
      if (result.error) {
        const message = String(result.error.message || "");
        if (message.includes("STALE") || message.includes("REVISION")) throw new HttpError("SONG_INTERPRETATION_SOURCE_STALE", 409, "This interpretation no longer matches the saved audio. Create a new draft.");
        throw new Error(message || "Interpretation confirmation failed.");
      }
      return json(req, { interpretation: result.data, confirmed: true });
    }
    throw new HttpError("INVALID_ACTION", 400, "Use save_draft, propose, or confirm.");
  } catch (error) {
    if (error instanceof HttpError) return json(req, { error: { code: error.code, message: error.message } }, error.status);
    console.error("beatvision-song-interpretation failed", String(error instanceof Error ? error.message : error).slice(0, 800));
    return json(req, { error: { code: "SONG_INTERPRETATION_REQUEST_FAILED", message: "The song interpretation request failed. Please retry." } }, 500);
  }
});
