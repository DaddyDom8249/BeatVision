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

// Keep browser origins aligned with the existing generation Edge allowlist.
const ALLOWED_ORIGINS = new Set([
  "https://beat-vision-kfk4sh067-beat-vision.vercel.app",
  "https://beat-vision-theta.vercel.app",
  "https://beat-vision-beat-vision.vercel.app",
  "https://beat-vision-git-main-beat-vision.vercel.app",
  "https://beat-vision-git-fix-style-description-genera-790bfa-beat-vision.vercel.app",
  "https://beat-vision-f8nn-git-fix-style-description-g-a4cacb-beat-vision.vercel.app",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  const permitted = trustedStudioOrigin(origin, ALLOWED_ORIGINS, Deno.env.get("BEATVISION_ALLOWED_PREVIEW_ORIGINS"));
  if (permitted) headers["Access-Control-Allow-Origin"] = permitted;
  return headers;
}

function env(name: string) { return String(Deno.env.get(name) || "").trim(); }

// Auth failures must surface as 401, not fall through to the generic 500.
class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AuthError("Authentication required.");
  const response = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"), Authorization: "Bearer " + token },
  });
  if (!response.ok) throw new AuthError("Invalid or expired authentication session.");
  const user = await response.json();
  if (!user?.id) throw new AuthError("Authenticated user could not be established.");
  return String(user.id);
}

function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: corsHeaders(req),
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  try {
    if (req.method !== "POST") return json({ error: "POST required." }, 405);
    const userId = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || body.project_id || "");
    if (!projectId) return json({ error: "projectId is required." }, 400);
    const audioRevision = String(body.audioRevision || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(audioRevision))
      return json({ error: "Audio revision is required.", code: "SONG_AUDIO_REVISION_REQUIRED" }, 400);

    const admin = adminClient();
    const { data: project, error: projectError } = await admin.from("projects")
      .select("id,owner_id,song_duration").eq("id", projectId).maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project || project.owner_id !== userId) return json({ error: "Project not found or access denied." }, 403);

    const { data: song, error: songError } = await admin.from("songs")
      .select("id,audio_path,audio_revision,analysis").eq("project_id", projectId).maybeSingle();
    if (songError) throw new Error(songError.message);
    if (!song?.audio_path) return json({ error: "Save an audio track before analyzing it." }, 400);
    if (song.audio_revision !== audioRevision)
      return json({ error: "Song audio changed. Reload before analyzing.", code: "SONG_AUDIO_REVISION_CHANGED" }, 409);

    const groqKey = env("GROQ_FREE_API_KEY");

    // The owner confirmed this separate key belongs to their Free-plan
    // account. Never fall back to the legacy paid GROQ_API_KEY.
    const freeAccountVerified = Boolean(groqKey) && env("GROQ_FREE_ACCOUNT_VERIFIED") === "true";
    if (!freeAccountVerified) return json({error:"PROVIDER_COST_UNVERIFIED: The dedicated free-account key is not configured. Local analysis remains available."},503);

    // Production stores audio in the `songs` bucket (see SongPage/useSong);
    // reading `audio` fails to resolve the signed URL and breaks transcription.
    const signed = await admin.storage.from("songs").createSignedUrl(String(song.audio_path), 900);
    if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || "Could not create a temporary audio URL.");

    const form = new FormData();
    form.append("url", signed.data.signedUrl);
    form.append("model", "whisper-large-v3-turbo");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
    form.append("temperature", "0");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + groqKey },
      body: form,
    });
    const raw = await response.text();
    let data: any;
    try { data = raw ? JSON.parse(raw) : null; } catch { data = { raw }; }
    if (!response.ok) throw new Error("Groq transcription failed (" + response.status + "): " + String(data?.error?.message || data?.message || raw).slice(0, 800));

    const existing = song.analysis && typeof song.analysis === "object" ? song.analysis as Record<string, unknown> : {};
    const transcriptionDuration = Number(data?.duration);
    const existingDuration = Number(existing.duration_seconds);
    const projectDuration = Number(project.song_duration);
    // Keep the original audio timeline authoritative when decoding already
    // established it. Whisper may report a different transcription duration.
    const authoritativeDuration = Number.isFinite(existingDuration) && existingDuration > 0
      ? existingDuration
      : (Number.isFinite(transcriptionDuration) && transcriptionDuration > 0
        ? transcriptionDuration
        : (Number.isFinite(projectDuration) && projectDuration > 0 ? projectDuration : null));
    if (authoritativeDuration === null) {
      return json({
        error: "No valid audio duration is available. Decode the saved song or retry transcription before completing analysis.",
        code: "AUDIO_DURATION_UNAVAILABLE",
      }, 422);
    }
    const analysis = {
      ...existing,
      duration_seconds: authoritativeDuration,
      transcript: data?.text ?? null,
      transcript_segments: Array.isArray(data?.segments) ? data.segments : [],
      word_timestamps: Array.isArray(data?.words) ? data.words : [],
      transcription_provider: "groq",
      transcription_model: "whisper-large-v3-turbo",
      transcription_method: "groq_whisper",
      transcription_status: "completed",
      status_detail: "",
    };

    // Song and project duration are updated in one service-only transaction.
    // The RPC checks audio revision and path again under row locks.
    const { data: persisted, error: updateError } = await admin.rpc("complete_song_transcription", {
      p_project_id: projectId,
      p_song_id: String(song.id),
      p_actor_id: userId,
      p_audio_revision: audioRevision,
      p_audio_path: String(song.audio_path),
      p_analysis: analysis,
      p_duration: authoritativeDuration,
    });
    if (updateError) throw new Error(updateError.message);
    if (persisted !== true)
      return json({ error: "Song audio changed during transcription. Reload and retry.", code: "SONG_AUDIO_REVISION_CHANGED" }, 409);
    return json({ status: "completed", analysis });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message, code: "UNAUTHENTICATED" }, error.status);
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
