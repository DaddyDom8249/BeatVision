import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://beat-vision-theta.vercel.app",
  "https://beat-vision-beat-vision.vercel.app",
  "https://beat-vision-git-main-beat-vision.vercel.app",
  "https://beat-vision-git-fix-style-description-genera-790bfa-beat-vision.vercel.app",
  "https://beat-vision-f8nn-git-fix-style-description-g-a4cacb-beat-vision.vercel.app",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function env(name: string) { return String(Deno.env.get(name) || "").trim(); }

function admin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

async function authenticate(req: Request) {
  const queueSecret = String(req.headers.get("X-BeatVision-Queue-Secret") || "").trim();
  if (queueSecret) {
    const db = admin();
    const config = await db.rpc("get_generation_scheduler_secret");
    if (config.error) throw new HttpError(500, "SCHEDULER_CONFIG_FAILED", config.error.message);
    if (config.data && queueSecret === String(config.data)) return { kind: "system" as const, userId: null };
  }

  const token = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(token)) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required.");

  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"), {
    global: { headers: { Authorization: token } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "UNAUTHENTICATED", "Invalid or expired authentication session.");
  return { kind: "user" as const, userId: data.user.id };
}

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function arenaBase() {
  const value = env("ARENA_GATEWAY_URL").replace(/\/$/, "");
  if (!value) throw new Error("Arena gateway is not configured.");
  return value;
}

function arenaToken() {
  const value = env("ARENA_GATEWAY_TOKEN");
  if (!value) throw new Error("Arena gateway token is not configured.");
  return value;
}

function modelFor(type: string) {
  return type === "scene_image" ? "flux-schnell" : type === "scene_motion" ? "ltx-video" : null;
}

async function bridgePayload(db: any, job: any) {
  const snapshot = job.input_snapshot || {};
  const lock = snapshot.vision_snapshot || {};
  const song = lock.song || {};
  const world = lock.world || {};
  const style = lock.style_bible || {};
  const analysis = song.analysis && typeof song.analysis === "object" ? song.analysis : {};
  const scene = snapshot.scene;
  const duration = Number(analysis.duration_seconds ?? snapshot.plan?.duration_seconds ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Frozen song duration is missing.");

  if (job.job_type === "assembly") {
    const scenes = Array.isArray(snapshot.scenes) ? snapshot.scenes : [];
    const motionClips = Array.isArray(snapshot.motion_clips) ? snapshot.motion_clips : [];
    if (!scenes.length) throw new Error("ASSEMBLY_SCENES_MISSING: No approved master timeline scenes are frozen.");
    if (motionClips.length !== scenes.length) throw new Error("ASSEMBLY_MOTION_COVERAGE_INVALID: Approved motion does not cover every scene.");
    const audioPath = String(snapshot.audio_path || "").trim();
    if (!audioPath) throw new Error("ASSEMBLY_AUDIO_MISSING: Frozen song audio path is missing.");
    const signed = await db.storage.from("songs").createSignedUrl(audioPath, 3600);
    if (signed.error || !signed.data?.signedUrl) throw new Error("ASSEMBLY_AUDIO_SIGNING_FAILED: " + (signed.error?.message || "No signed URL returned."));
    return {
      source: { application: "beatvision", contract: "2.0" },
      project: { id: job.project_id },
      song: { id: song.id, title: song.title, artist: song.artist, lyrics: song.lyrics, duration_seconds: duration },
      analysis: { ...analysis, analysis_method: analysis.analysis_method },
      world: { ...world, version: String(world.id || snapshot.world_report_id || "world") + ":r" + String(lock.revision_number || snapshot.vision_revision || 1) },
      style: { ...style, version: String(style.id || lock.style_bible_id || "style") },
      vision_lock: { ...lock, locked: true, version: String(lock.id || job.vision_lock_id) },
      storyboard: { songDuration: duration, song_duration: duration, scenes: scenes.map((item: any) => ({ ...item, scene: Number(item.scene_number), startTime: Number(item.start_time), endTime: Number(item.end_time) })), visual_beats: scenes.map((item: any) => ({ ...item, scene: Number(item.scene_number), startTime: Number(item.start_time), endTime: Number(item.end_time) })) },
      motion: { clips: motionClips },
      audio_data: signed.data.signedUrl,
      generation: { cost_class: "free", model: null, idempotency_key: job.idempotency_key, job_id: job.id },
    };
  }

  if (!scene) throw new Error("Frozen Scene Direction is missing.");

  let images: { images: Array<{ image_url: string; scene_id: string; approved: boolean }> } | undefined;
  if (job.job_type === "scene_motion") {
    const imageResult = await db.from("scene_image_assets").select("id,image_url,storage_path,scene_id,status,approved,created_at").eq("project_id", job.project_id).eq("visual_plan_id", job.visual_plan_id).eq("scene_id", job.visual_plan_scene_id).eq("approved", true).eq("status", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (imageResult.error) throw new Error("APPROVED_SCENE_IMAGE_LOOKUP_FAILED: " + imageResult.error.message);
    if (!imageResult.data) throw new Error("APPROVED_SCENE_IMAGE_REQUIRED: Motion requires an approved real scene image.");
    let motionImageUrl = String(imageResult.data.image_url || "").trim();
    if (imageResult.data.storage_path) {
      const signed = await db.storage.from("visual-assets").createSignedUrl(String(imageResult.data.storage_path), 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("APPROVED_SCENE_IMAGE_SIGNING_FAILED: " + (signed.error?.message || "No signed URL returned."));
      motionImageUrl = String(signed.data.signedUrl);
    }
    if (!/^https?:\/\//i.test(motionImageUrl)) throw new Error("APPROVED_SCENE_IMAGE_REQUIRED: Motion requires an approved real scene image.");
    images = { images: [{ image_url: motionImageUrl, scene_id: String(imageResult.data.scene_id), approved: true }] };
  }
  return {
    source: { application: "beatvision", contract: "2.0" },
    project: { id: job.project_id },
    song: {
      id: song.id,
      title: song.title,
      artist: song.artist,
      lyrics: song.lyrics,
      duration_seconds: duration,
    },
    analysis: {
      ...analysis,
      analysis_method: analysis.analysis_method,
    },
    world: {
      ...world,
      version: String(world.id || snapshot.world_report_id || "world") + ":r" + String(lock.revision_number || snapshot.vision_revision || 1),
    },
    style: { ...style, version: String(style.id || lock.style_bible_id || "style") },
    vision_lock: {
      ...lock,
      locked: true,
      version: String(lock.id || job.vision_lock_id),
    },
    scene,
    images,
    generation: {
      cost_class: "free",
      model: modelFor(job.job_type),
      idempotency_key: job.idempotency_key,
      job_id: job.id,
    },
  };
}

async function arena(path: string, method: "GET" | "POST", payload: unknown, requestId: string) {
  const response = await fetch(arenaBase() + path, {
    method,
    headers: {
      Authorization: "Bearer " + arenaToken(),
      "Content-Type": "application/json",
      "X-BeatVision-Contract": "2.0",
      "X-BeatVision-Request": requestId,
    },
    body: method === "POST" ? JSON.stringify({ payload }) : undefined,
  });
  const raw = await response.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw: raw.slice(0, 4000) }; }
  return { response, data };
}

function extractImageBase64(data: any) {
  const candidates = [
    data?.image_base64,
    data?.image,
    data?.result?.image_base64,
    data?.result?.image,
    data?.result?.images?.[0]?.image_base64,
    data?.result?.images?.[0]?.image,
    data?.images?.[0]?.image_base64,
    data?.images?.[0]?.image,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || null;
}

function extractImageUrl(data: any) {
  const candidates = [
    data?.image_url,
    data?.imageUrl,
    data?.result?.image_url,
    data?.result?.imageUrl,
    data?.result?.images?.[0]?.image_url,
    data?.result?.images?.[0]?.imageUrl,
    data?.images?.[0]?.image_url,
    data?.images?.[0]?.imageUrl,
    data?.result?.images?.[0]?.url,
    data?.images?.[0]?.url,
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()))?.trim() || null;
}

function extractRenderId(data: any) {
  const candidates = [data?.render_id, data?.renderId, data?.result?.render_id, data?.result?.renderId, data?.response?.id];
  return candidates.find((value) => typeof value === "string" && value.trim())?.trim() || null;
}

function extractVideoUrl(data: any) {
  const candidates = [data?.video_url,data?.videoUrl,data?.url,data?.result?.video_url,data?.result?.videoUrl,data?.result?.url,data?.result?.video?.url,data?.video?.url];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim()))?.trim() || null;
}

async function persistSceneImage(db: any, job: any, responseData: any) {
  if (job.job_type !== "scene_image") return;
  const existing = await db.from("scene_image_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
  if (existing.error) throw new Error("SCENE_IMAGE_CHECK_FAILED: " + existing.error.message);
  if (existing.data) return existing.data;

  const imageUrl = extractImageUrl(responseData);
  const imageBase64 = extractImageBase64(responseData);
  if (!imageUrl && !imageBase64) throw new Error("ARENA_IMAGE_OUTPUT_MISSING: Arena completed without a real image URL or image data.");
  if (!job.visual_plan_scene_id) throw new Error("ARENA_IMAGE_SCENE_MISSING: scene_image job has no approved scene.");

  let persistedUrl = imageUrl;
  let storagePath: string | null = null;

  if (!persistedUrl && imageBase64) {
    const encoded = imageBase64.includes(",") ? imageBase64.slice(imageBase64.indexOf(",") + 1) : imageBase64;
    let binary: Uint8Array;
    try {
      const raw = atob(encoded);
      binary = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    } catch {
      throw new Error("SCENE_IMAGE_BASE64_INVALID: Arena returned invalid base64 image data.");
    }

    storagePath = `${job.project_id}/scene-images/${job.visual_plan_id}/${job.visual_plan_scene_id}/${job.id}.jpg`;
    const upload = await db.storage.from("visual-assets").upload(storagePath, binary, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) throw new Error("SCENE_IMAGE_STORAGE_UPLOAD_FAILED: " + upload.error.message);

    const signed = await db.storage.from("visual-assets").createSignedUrl(storagePath, 3600);
    if (signed.error || !signed.data?.signedUrl) throw new Error("SCENE_IMAGE_SIGNING_FAILED: " + (signed.error?.message || "No signed URL returned."));
    persistedUrl = String(signed.data.signedUrl);
  }

  const insert = await db.from("scene_image_assets").insert({
    project_id: job.project_id,
    visual_plan_id: job.visual_plan_id,
    scene_id: job.visual_plan_scene_id,
    generation_job_id: job.id,
    provider: String(responseData?.provider || "arena"),
    model: String(responseData?.model || modelFor(job.job_type) || "unknown"),
    image_url: persistedUrl,
    storage_path: storagePath,
    status: "generated",
    approved: false,
  }).select("id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved,created_at,updated_at").single();

  if (insert.error) {
    const raceCheck = await db.from("scene_image_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
    if (raceCheck.data) return raceCheck.data;
    throw new Error("SCENE_IMAGE_PERSIST_FAILED: " + insert.error.message);
  }
  return insert.data;
}

async function persistFinalVideo(db: any, job: any, responseData: any) {
  if (job.job_type !== "assembly") return;
  const videoUrl = extractVideoUrl(responseData);
  if (!videoUrl) throw new Error("FINAL_VIDEO_OUTPUT_MISSING: Shotstack completed without a real video URL.");

  const existing = await db.from("final_videos").select("id,project_id,generation_job_id,video_url,preview_video_url,duration,format,quality,render_status,downloadable,segment_count,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
  if (existing.error) throw new Error("FINAL_VIDEO_CHECK_FAILED: " + existing.error.message);
  if (existing.data) return existing.data;

  const duration = Number(responseData?.result?.duration_seconds || responseData?.duration_seconds || job.input_snapshot?.plan?.duration_seconds || 0);
  const finalInsert = await db.from("final_videos").upsert({
    project_id: job.project_id,
    generation_job_id: job.id,
    title: String(job.input_snapshot?.plan?.title || "BeatVision Final Video"),
    video_url: videoUrl,
    preview_video_url: videoUrl,
    audio_file: String(job.input_snapshot?.audio_path || ""),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    format: "mp4",
    quality: "hd",
    render_status: "complete",
    downloadable: false,
    segment_count: Array.isArray(job.input_snapshot?.scenes) ? job.input_snapshot.scenes.length : null
  }, { onConflict: "generation_job_id" }).select("id,project_id,generation_job_id,video_url,preview_video_url,duration,format,quality,render_status,downloadable,segment_count,created_at,updated_at").single();

  if (finalInsert.error) {
    const raceCheck = await db.from("final_videos").select("id,project_id,generation_job_id,video_url,preview_video_url,duration,format,quality,render_status,downloadable,segment_count,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
    if (raceCheck.data) return raceCheck.data;
    throw new Error("FINAL_VIDEO_PERSIST_FAILED: " + finalInsert.error.message);
  }
  return finalInsert.data;
}

async function persistMotionClip(db: any, job: any, responseData: any) {
  if (job.job_type !== "scene_motion") return;
  const videoUrl = extractVideoUrl(responseData);
  if (!videoUrl) throw new Error("ARENA_MOTION_OUTPUT_MISSING: Arena completed without a real video URL.");
  if (!job.visual_plan_scene_id) throw new Error("ARENA_MOTION_SCENE_MISSING: scene_motion job has no approved scene.");
  const imageResult = await db.from("scene_image_assets").select("id").eq("project_id", job.project_id).eq("visual_plan_id", job.visual_plan_id).eq("scene_id", job.visual_plan_scene_id).eq("approved", true).eq("status", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (imageResult.error) throw new Error("APPROVED_SCENE_IMAGE_LOOKUP_FAILED: " + imageResult.error.message);
  if (!imageResult.data?.id) throw new Error("APPROVED_SCENE_IMAGE_REQUIRED: Motion completed without an approved source image.");
  const insert = await db.from("motion_clip_assets").upsert({ project_id: job.project_id, visual_plan_id: job.visual_plan_id, scene_id: job.visual_plan_scene_id, generation_job_id: job.id, scene_image_id: imageResult.data.id, provider: String(responseData?.provider || responseData?.result?.clips?.[0]?.provider || "unknown"), model: String(responseData?.model || responseData?.result?.clips?.[0]?.model || "unknown"), video_url: videoUrl, status: "generated", approved: false }, { onConflict: "generation_job_id" }).select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").single();
  if (insert.error) throw new Error("MOTION_CLIP_PERSIST_FAILED: " + insert.error.message);
  return insert.data;
}

function compactArenaResponse(data: any, jobType?: string) {
  if (jobType !== "scene_image" || !data || typeof data !== "object") return data;
  const clean = JSON.parse(JSON.stringify(data));
  delete clean.image;
  delete clean.image_base64;
  const images = clean?.result?.images;
  if (Array.isArray(images)) {
    for (const image of images) {
      if (image && typeof image === "object") {
        delete image.image;
        delete image.image_base64;
      }
    }
  }
  return clean;
}

function terminalState(response: Response, data: any, jobType?: string) {
  if (!response.ok || data?.ok === false) return "failed";

  const status = String(data?.status || data?.state || "").trim().toLowerCase();

  if (["failed", "error", "provider_error", "provider_unavailable", "unavailable", "cancelled", "canceled"].includes(status)) return "failed";

  // Arena's BeatVision scene-image bridge is synchronous and may return either
  // a hosted image URL or real base64 image data (Cloudflare Workers AI path).
  if (jobType === "scene_image" && (extractImageUrl(data) || extractImageBase64(data))) return "completed";
  if (["processing", "submitted", "queued", "pending", "running", "in_progress"].includes(status)) return "processing";

  // A successful HTTP response is not proof that media is complete.  Require
  // an explicit terminal-success state so an unrecognised provider response
  // cannot be persisted as a completed job without real output.
  if (["completed", "complete", "succeeded", "success", "done", "finished"].includes(status)) return "completed";

  return "processing";
}

async function setFailed(db: any, id: string, message: string, detail?: unknown) {
  const res = await db.from("generation_jobs").update({
    status: "failed",
    error: { code: "ARENA_GENERATION_FAILED", message: message.slice(0, 1200), detail },
  }).eq("id", id).in("status", ["queued", "submitted", "processing"]).select("id");
  if (res.error) throw new Error("SET_FAILED_PERSIST_FAILED: " + res.error.message);
  if (!res.data || res.data.length === 0) {
    throw new Error("SET_FAILED_ZERO_ROWS_AFFECTED: Job status was not updated to failed.");
  }
}

async function run(db: any, job: any) {
  if (!["scene_image", "scene_motion", "assembly"].includes(String(job.job_type))) {
    throw new Error("GENERATION_JOB_TYPE_NOT_SUPPORTED: only scene_image, scene_motion, and assembly are controller-backed.");
  }
  if (job.status !== "queued") return job;

  const requestId = "beatvision:" + job.id;
  const claim = await db.from("generation_jobs")
    .update({
      status: "submitted",
      provider: "arena",
      provider_job_id: requestId,
      attempts: Number(job.attempts || 0) + 1,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data) throw new Error("Generation job was already claimed.");
  job = claim.data;

  const processing = await db.from("generation_jobs")
    .update({ status: "processing" })
    .eq("id", job.id)
    .eq("status", "submitted")
    .select("*")
    .single();
  if (processing.error) throw new Error(processing.error.message);
  job = processing.data;

  try {
    const path = job.job_type === "scene_image" ? "/v2/scene-image" : job.job_type === "scene_motion" ? "/v2/animate" : "/v2/assemble";
    const result = await arena(path, "POST", await bridgePayload(db, job), requestId);
    const state = terminalState(result.response, result.data, job.job_type);

    if (state === "failed") {
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena rejected generation."), compactArenaResponse(result.data, job.job_type));
    } else if (state === "completed") {
      if (job.job_type === "assembly") {
        const finalVideo = await persistFinalVideo(db, job, result.data);
        const updateRes = await db.from("generation_jobs").update({ status: "completed", output: { arena_request_id: requestId, arena_response: compactArenaResponse(result.data, job.job_type), bridge_contract: "2.0", final_video: finalVideo } }).eq("id", job.id).eq("status", "processing").select("id");
        if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
        if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
      } else {
        const persistedImage = await persistSceneImage(db, job, result.data);
        const persistedMotion = await persistMotionClip(db, job, result.data);
        const updateRes = await db.from("generation_jobs").update({ status: "completed", output: { arena_request_id: requestId, arena_response: compactArenaResponse(result.data, job.job_type), bridge_contract: "2.0", scene_image_asset: persistedImage || null, motion_clip_asset: persistedMotion || null } }).eq("id", job.id).eq("status", "processing").select("id");
        if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
        if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
      }
    } else if (job.job_type === "scene_image") {
      await setFailed(db, job.id, "Arena image generation did not complete synchronously.", compactArenaResponse(result.data, job.job_type));
    } else {
      const upstreamJobId = job.job_type === "assembly"
        ? String(extractRenderId(result.data) || "").trim()
        : String(result.data?.job_id || result.data?.provider_job_id || result.data?.id || "").trim();

      if (!upstreamJobId) {
        await setFailed(db, job.id, "Arena reported processing without a provider job id.", compactArenaResponse(result.data, job.job_type));
      } else {
        const updateRes = await db.from("generation_jobs").update({
          output: {
            arena_request_id: requestId,
            upstream_job_id: upstreamJobId,
            arena_response: compactArenaResponse(result.data, job.job_type),
            bridge_contract: "2.0",
          },
        }).eq("id", job.id).eq("status", "processing").select("id");
        if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
        if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
      }
    }
  } catch (error) {
    await setFailed(db, job.id, error instanceof Error ? error.message : String(error));
  }

  const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
  if (latest.error) throw new Error(latest.error.message);
  return latest.data;
}

async function poll(db: any, job: any) {
  if (job.status !== "processing") return job;
  const upstream = String(job.output?.upstream_job_id || "").trim();
  if (!upstream) {
    await setFailed(db, job.id, "Arena reported processing without a provider job id.", job.output);
    const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
    if (latest.error) throw new Error(latest.error.message);
    return latest.data;
  }

  const path = job.job_type === "scene_motion"
    ? "/v1/video/animate/jobs/" + encodeURIComponent(upstream)
    : job.job_type === "assembly"
      ? "/v1/video/assemble/status/" + encodeURIComponent(upstream)
      : null;

  if (!path) {
    await setFailed(db, job.id, `Arena job_type '${job.job_type}' does not support asynchronous polling.`, job.output);
    const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
    if (latest.error) throw new Error(latest.error.message);
    return latest.data;
  }

  try {
    const pollPayload = job.job_type === "assembly" ? { target_duration_seconds: Number(job.input_snapshot?.plan?.duration_seconds || 0) } : null;
    const result = await arena(path, job.job_type === "assembly" ? "POST" : "GET", pollPayload, "beatvision:" + job.id + ":poll");
    const state = terminalState(result.response, result.data);
    if (state === "failed") {
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena provider job failed."), result.data);
    } else if (state === "completed") {
      if (job.job_type === "scene_motion") {
        const persistedMotion = await persistMotionClip(db, job, result.data);
        const updateRes = await db.from("generation_jobs").update({ status: "completed", output: { ...(job.output || {}), arena_status_response: result.data, motion_clip_asset: persistedMotion || null } }).eq("id", job.id).eq("status", "processing").select("id");
        if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
        if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
      } else if (job.job_type === "assembly") {
        const finalVideo = await persistFinalVideo(db, job, result.data);
        const updateRes = await db.from("generation_jobs").update({ status: "completed", output: { ...(job.output || {}), arena_status_response: result.data, final_video: finalVideo } }).eq("id", job.id).eq("status", "processing").select("id");
        if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
        if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
      }
    } else {
      const updateRes = await db.from("generation_jobs").update({
        output: { ...(job.output || {}), arena_status_response: result.data, last_polled_at: new Date().toISOString() },
      }).eq("id", job.id).eq("status", "processing").select("id");
      if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
      if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
    }
  } catch (error) {
    await setFailed(db, job.id, error instanceof Error ? error.message : String(error));
  }

  const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
  if (latest.error) throw new Error(latest.error.message);
  return latest.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST required." }, 405);
  try {
    const uid = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || body.project_id || "");
    const jobId = String(body.jobId || body.job_id || "");
    const action = String(body.action || "run");
    const db = admin();

    if (action === "drain") {
      if (uid.kind !== "system") return json(req, { error: { code: "UNAUTHORIZED_SCHEDULER", message: "Scheduler authorization required." } }, 401);
      const pending = await db.from("generation_jobs").select("*").in("status", ["queued", "processing"]).order("created_at", { ascending: true }).limit(8);
      if (pending.error) throw new Error(pending.error.message);
      const results = [];
      for (const item of pending.data || []) {
        try {
          const result = item.status === "processing" ? await poll(db, item) : await run(db, item);
          results.push({ id: item.id, action: item.status === "processing" ? "poll" : "run", status: result.status });
        } catch (error) {
          results.push({ id: item.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return json(req, { ok: true, scanned: (pending.data || []).length, results });
    }

    if (!projectId || (action !== "image_url" && !jobId)) return json(req, { error: { code: "JOB_REQUIRED", message: "projectId and jobId are required." } }, 400);
    if (!["run", "poll", "image_url"].includes(action)) return json(req, { error: { code: "INVALID_ACTION", message: "action must be run, poll, image_url, or drain." } }, 400);
    const project = await db.from("projects").select("id,owner_id").eq("id", projectId).maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data || (uid.kind !== "system" && project.data.owner_id !== uid.userId)) return json(req, { error: { code: "NOT_FOUND", message: "Project not found." } }, 404);

    // Re-sign only an asset belonging to the authenticated owner's project.
    // Generated paths begin with project ID; user-upload storage policies use user ID.
    if (action === "image_url") {
      const asset = await db.from("scene_image_assets").select("id,image_url,storage_path")
        .eq("id", String(body.assetId || "")).eq("project_id", projectId).maybeSingle();
      if (asset.error) throw new Error(asset.error.message);
      if (!asset.data) return json(req, { error: { code: "NOT_FOUND", message: "Image asset not found." } }, 404);
      if (!asset.data.storage_path) return json(req, { image_url: asset.data.image_url });
      const signed = await db.storage.from("visual-assets").createSignedUrl(asset.data.storage_path, 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("IMAGE_SIGNING_FAILED: " + (signed.error?.message || "No signed URL returned."));
      return json(req, { image_url: signed.data.signedUrl });
    }

    const job = await db.from("generation_jobs").select("*").eq("id", jobId).eq("project_id", projectId).maybeSingle();
    if (job.error) throw new Error(job.error.message);
    if (!job.data) return json(req, { error: { code: "NOT_FOUND", message: "Generation job not found." } }, 404);

    const result = action === "poll" ? await poll(db, job.data) : await run(db, job.data);
    return json(req, { job: result });
  } catch (error) {
    if (error instanceof HttpError) {
      return json(req, { error: { code: error.code, message: error.message } }, error.status);
    }
    return json(req, { error: { code: "GENERATION_CONTROLLER_FAILED", message: error instanceof Error ? error.message : String(error) } }, 500);
  }
});
