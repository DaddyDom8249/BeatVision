import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function env(name: string) { return String(Deno.env.get(name) || "").trim(); }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method !== "POST") return json({ error: "POST required." }, 405);
    const userId = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || body.project_id || "");
    if (!projectId) return json({ error: "projectId is required." }, 400);

    const admin = adminClient();
    const { data: project, error: projectError } = await admin.from("projects")
      .select("id,owner_id,song_duration").eq("id", projectId).maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project || project.owner_id !== userId) return json({ error: "Project not found or access denied." }, 403);

    const { data: song, error: songError } = await admin.from("songs")
      .select("id,audio_path,analysis").eq("project_id", projectId).maybeSingle();
    if (songError) throw new Error(songError.message);
    if (!song?.audio_path) return json({ error: "Save an audio track before analyzing it." }, 400);

    const groqKey = env("GROQ_API_KEY");
    if (!groqKey) return json({ error: "GROQ_API_KEY is not configured." }, 503);

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
    const authoritativeDuration = Number.isFinite(transcriptionDuration) && transcriptionDuration > 0
      ? transcriptionDuration
      : (Number.isFinite(existingDuration) && existingDuration > 0
        ? existingDuration
        : (Number.isFinite(projectDuration) && projectDuration > 0 ? projectDuration : null));
    const analysis = {
      ...existing,
      duration_seconds: authoritativeDuration,
      transcript: data?.text ?? null,
      transcript_segments: Array.isArray(data?.segments) ? data.segments : [],
      word_timestamps: Array.isArray(data?.words) ? data.words : [],
      transcription_provider: "groq",
      transcription_model: "whisper-large-v3-turbo",
      transcription_method: "groq_whisper",
    };

    if (Number.isFinite(authoritativeDuration) && authoritativeDuration > 0) {
      const { error: projectDurationError } = await admin.from("projects")
        .update({ song_duration: authoritativeDuration })
        .eq("id", projectId);
      if (projectDurationError) throw new Error(projectDurationError.message);
    }

    const { error: updateError } = await admin.from("songs").update({
      analysis_status: "completed",
      analysis,
      analyzed_at: new Date().toISOString(),
    }).eq("id", String(song.id));
    if (updateError) throw new Error(updateError.message);

    return json({ status: "completed", analysis });
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message, code: "UNAUTHENTICATED" }, error.status);
    }
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});