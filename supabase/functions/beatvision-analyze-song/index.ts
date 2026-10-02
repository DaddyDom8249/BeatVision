import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const MODELS = [
  "AudioFileInfoV1",
  "BpmV2",
  "KeyV2",
  "TimeSignatureV2",
  "SegmentationV1",
  "MainGenreV2",
  "MoodAdvancedV2",
  "MovementV2",
  "ValenceArousalV2",
  "InstrumentsV2",
  "VocalsV2",
  "AutoDescriptionV2",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function env(name: string) {
  return String(Deno.env.get(name) || "").trim();
}

function bearer(req: Request) {
  const value = req.headers.get("Authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Authentication required.");
  return match[1];
}

async function getUser(req: Request) {
  const token = bearer(req);
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase authentication configuration is missing.");
  const response = await fetch(url + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + token },
  });
  if (!response.ok) throw new Error("Invalid or expired authentication session.");
  const user = await response.json();
  if (!user?.id) throw new Error("Authenticated user could not be established.");
  return { id: String(user.id), token };
}

function adminClient() {
  const url = env("SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, service);
}

function cyaniteKey() {
  const key = env("CYANITE_API_KEY");
  if (!key) {
    const error = new Error("Cyanite API key is not configured. Add CYANITE_API_KEY to the Supabase Edge Function secrets.");
    (error as Error & { code?: string }).code = "CYANITE_NOT_CONFIGURED";
    throw error;
  }
  return key;
}

async function getSong(admin: ReturnType<typeof adminClient>, projectId: string, userId: string) {
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("id,owner_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) throw new Error(projectError.message);
  if (!project || project.owner_id !== userId) throw new Error("Project not found or access denied.");

  const { data: song, error } = await admin
    .from("songs")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!song) throw new Error("Song not found.");
  if (!song.audio_path) throw new Error("Save an audio track before analyzing it.");
  return song;
}

async function uploadTrack(admin: ReturnType<typeof adminClient>, song: Record<string, unknown>, apiKey: string) {
  const signed = await admin.storage.from("audio").createSignedUrl(String(song.audio_path), 900);
  if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message || "Could not create a temporary audio URL.");

  const audioResponse = await fetch(signed.data.signedUrl);
  if (!audioResponse.ok) throw new Error("Could not retrieve the uploaded audio for musical analysis.");

  const bytes = await audioResponse.arrayBuffer();
  const contentType = audioResponse.headers.get("content-type") || "audio/mpeg";
  const filename = String(song.audio_path).split("/").pop() || "beatvision-audio";

  const form = new FormData();
  form.append("title", String(song.title || "BeatVision track"));
  form.append("inputType", "MP3");
  form.append("externalId", String(song.id));
  form.append("file", new File([bytes], filename, { type: contentType }));

  const response = await fetch("https://rest-api.cyanite.ai/v1/library-tracks", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    throw new Error("Cyanite upload failed (" + response.status + "): " + String(data?.detail || data?.message || text).slice(0, 800));
  }

  const trackId = String(data?.id || data?.track?.id || data?.data?.track?.id || "");
  if (!trackId) throw new Error("Cyanite upload succeeded but returned no library track ID.");
  return trackId;
}

async function getModels(trackId: string, apiKey: string) {
  const query = MODELS.map((model) => "model=" + encodeURIComponent(model)).join("&");
  const response = await fetch(
    "https://rest-api.cyanite.ai/v1/library-tracks/" + encodeURIComponent(trackId) + "/models?" + query,
    { headers: { "x-api-key": apiKey, Accept: "application/json" } },
  );

  const text = await response.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    if (response.status === 404 || response.status === 409 || response.status === 425) {
      return { ready: false, status: response.status };
    }
    throw new Error("Cyanite analysis lookup failed (" + response.status + "): " + String(data?.detail || data?.message || text).slice(0, 800));
  }

  return { ready: true, data };
}

function modelValue(models: any, version: string) {
  if (Array.isArray(models)) return models.find((item) => item?.version === version);
  if (models && typeof models === "object") {
    if (models[version]) return models[version];
    if (models.models?.[version]) return models.models[version];
    if (Array.isArray(models.results)) return models.results.find((item: any) => item?.version === version);
  }
  return null;
}

function normalize(raw: any, fallbackDuration: number | null) {
  const bpm = modelValue(raw, "BpmV2");
  const key = modelValue(raw, "KeyV2");
  const meter = modelValue(raw, "TimeSignatureV2");
  const segmentation = modelValue(raw, "SegmentationV1");
  const genre = modelValue(raw, "MainGenreV2");
  const mood = modelValue(raw, "MoodAdvancedV2");
  const movement = modelValue(raw, "MovementV2");
  const valence = modelValue(raw, "ValenceArousalV2");
  const instruments = modelValue(raw, "InstrumentsV2");
  const vocals = modelValue(raw, "VocalsV2");
  const description = modelValue(raw, "AutoDescriptionV2");
  const info = modelValue(raw, "AudioFileInfoV1");

  const segments = Array.isArray(segmentation?.segments)
    ? segmentation.segments.map((segment: any, index: number) => ({
        index: index + 1,
        start_time: Number(segment?.start ?? 0),
        end_time: Number(segment?.end ?? 0),
      }))
    : [];

  const duration = Number(info?.durationSeconds ?? info?.duration ?? fallbackDuration ?? 0);

  return {
    duration_seconds: duration,
    bpm: bpm?.tag ?? null,
    bpm_confidence: bpm?.confidence?.confidence ?? null,
    key: key?.tag ?? null,
    key_confidence: key?.confidence?.confidence ?? null,
    time_signature: meter?.tag ?? null,
    time_signature_confidence: meter?.confidence?.confidence ?? null,
    sections: segments,
    genre_tags: genre?.tags ?? [],
    mood_tags: mood?.tags ?? [],
    mood_scores: mood?.scores ?? null,
    movement_tags: movement?.tags ?? [],
    valence_arousal: {
      scores: valence?.scores ?? null,
      energy_level: valence?.energyLevel ?? null,
      energy_changes: valence?.energyChanges ?? null,
      emotion_profile: valence?.emotionProfile ?? null,
      emotion_changes: valence?.emotionChanges ?? null,
      segments: valence?.segments ?? null,
    },
    instruments: instruments?.tags ?? [],
    vocal_presence: vocals?.vocalPresence ?? null,
    vocal_tags: vocals?.tags ?? [],
    description: description?.description ?? null,
    provider: "cyanite",
    provider_models: MODELS,
    analysis_method: "cyanite_music_intelligence",
    structure_method: "Cyanite SegmentationV1",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required." } }, 405);

    const { id: userId } = await getUser(req);
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || body.project_id || "");
    const action = String(body.action || "start");
    if (!projectId) return json({ error: { code: "PROJECT_REQUIRED", message: "projectId is required." } }, 400);

    const admin = adminClient();
    const song = await getSong(admin, projectId, userId);
    const apiKey = cyaniteKey();

    if (action === "start") {
      const existing = song.analysis && typeof song.analysis === "object" ? song.analysis as Record<string, unknown> : {};
      let trackId = String(existing.provider_track_id || "");
      if (!trackId) trackId = await uploadTrack(admin, song, apiKey);

      const analysis = {
        ...existing,
        provider: "cyanite",
        provider_track_id: trackId,
        analysis_method: "cyanite_music_intelligence",
        status_detail: "processing",
      };

      const { error } = await admin.from("songs").update({
        analysis_status: "analyzing",
        analysis,
        analyzed_at: null,
      }).eq("id", String(song.id));
      if (error) throw new Error(error.message);

      return json({ status: "analyzing", provider: "cyanite", provider_track_id: trackId });
    }

    if (action === "status") {
      const existing = song.analysis && typeof song.analysis === "object" ? song.analysis as Record<string, unknown> : {};
      const trackId = String(body.trackId || existing.provider_track_id || "");
      if (!trackId) return json({ error: { code: "TRACK_REQUIRED", message: "No Cyanite track ID is associated with this song." } }, 400);

      const result = await getModels(trackId, apiKey);
      if (!result.ready) return json({ status: "analyzing", provider_track_id: trackId });

      const normalized = normalize(result.data, Number(existing.duration_seconds || 0) || null);
      const analysis = { ...normalized, provider_track_id: trackId, raw_provider_output: result.data };

      const { error } = await admin.from("songs").update({
        analysis_status: "completed",
        analysis,
        analyzed_at: new Date().toISOString(),
      }).eq("id", String(song.id));
      if (error) throw new Error(error.message);

      return json({ status: "completed", analysis });
    }

    return json({ error: { code: "INVALID_ACTION", message: "action must be start or status." } }, 400);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as Error & { code?: string }).code) : "ANALYSIS_FAILED";
    const message = error instanceof Error ? error.message : String(error);
    const status = code === "CYANITE_NOT_CONFIGURED" ? 503 : 500;
    return json({ error: { code, message } }, status);
  }
});