import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { validateImage, readImage } from "./image-media.ts";
import { verifyFinalMedia } from "./final-media.ts";
import { HF_MOTION, hfEligibility, hfSubmit, hfPoll, hfDownload, hfJobSeed, HfMotionError } from "./hf-motion.ts";

const ALLOWED_ORIGINS = new Set([
  "https://beat-vision-f8nn.vercel.app",
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

// Constant-size digest comparison avoids early-exit equality of raw secrets.
async function timingSafeEqualText(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const left = new Uint8Array(aDigest);
  const right = new Uint8Array(bDigest);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function authenticate(req: Request) {
  // A supplied scheduler header is always scheduler authentication.
  // Invalid (including blank) values never fall through to a user bearer token.
  if (req.headers.has("X-BeatVision-Queue-Secret")) {
    const queueSecret = String(req.headers.get("X-BeatVision-Queue-Secret") || "").trim();
    if (!queueSecret) throw new HttpError(401, "UNAUTHORIZED_SCHEDULER", "Invalid scheduler credential.");
    const db = admin();
    const config = await db.rpc("get_generation_scheduler_secret");
    if (config.error) throw new HttpError(500, "SCHEDULER_CONFIG_FAILED", "Scheduler configuration is unavailable.");
    const expected = String(config.data || "");
    if (expected && await timingSafeEqualText(queueSecret, expected))
      return { kind: "system" as const, userId: null };
    throw new HttpError(401, "UNAUTHORIZED_SCHEDULER", "Invalid scheduler credential.");
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

/**
 * Reject misleading "free" labels if the authenticated Arena bridge returns
 * any provider other than its pinned Cloudflare Workers AI Flux Schnell path.
 * The Worker itself checks the explicit Free entitlement BEFORE inference.
 */
function assertVerifiedFreeSceneImageResponse(data: any) {
  const providers = data?.result?.provider_path;
  const images = data?.result?.images;
  if (data?.ok !== true ||
      data?.bridge?.contract_version !== "2.0" ||
      data?.bridge?.cost_class !== "free" ||
      data?.bridge?.source_of_truth !== "beatvision" ||
      data?.bridge?.generation_model !== "flux-schnell" ||
      data?.result?.free_only !== true ||
      !Array.isArray(providers) || providers.length !== 1 ||
      providers[0] !== "cloudflare-workers-ai" ||
      !Array.isArray(images) || images.length !== 1 ||
      images[0]?.provider !== "cloudflare-workers-ai" ||
      images[0]?.model !== "flux-1-schnell" ||
      !extractImageBase64(data)) {
    throw new Error("FREE_IMAGE_PROVIDER_MISMATCH: Image output was not proven to come from the pinned free Cloudflare FLUX path.");
  }
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
    if (encoded.length > 12 * 1024 * 1024) throw new Error("SCENE_IMAGE_SIZE_INVALID");
    try {
      const raw = atob(encoded);
      binary = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    } catch {
      throw new Error("SCENE_IMAGE_BASE64_INVALID: Arena returned invalid base64 image data.");
    }

    const imageMedia = validateImage(binary);
    storagePath = `${job.project_id}/scene-images/${job.visual_plan_id}/${job.visual_plan_scene_id}/${job.id}.${imageMedia.extension}`;
    const upload = await db.storage.from("visual-assets").upload(storagePath, binary, {
      contentType: imageMedia.contentType,
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
    provider: String(responseData?.result?.images?.[0]?.provider || responseData?.provider || "arena"),
    model: String(responseData?.result?.images?.[0]?.model || responseData?.model || modelFor(job.job_type) || "unknown"),
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

  // Arena must probe the actual output media before we mark the final video complete.
  const result = responseData?.result || {};
  const proof = result.media_validation || {};
  let output: URL;
  try { output = new URL(videoUrl); }
  catch { throw new Error("FINAL_VIDEO_OUTPUT_URL_INVALID"); }
  if (output.protocol !== "https:" ||
      output.hostname !== "shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com" ||
      Boolean(output.username) || Boolean(output.password))
    throw new Error("FINAL_VIDEO_OUTPUT_HOST_UNTRUSTED");
  if (result.render_integrity !== "PASS" || proof.probed !== true ||
      proof.probe_provider !== "shotstack" || proof.format !== "mp4" ||
      proof.has_video_stream !== true || proof.has_audio_stream !== true)
    throw new Error("FINAL_VIDEO_MEDIA_NOT_VERIFIED: missing probed MP4 video/audio evidence.");
  const expected = Number(job.input_snapshot?.plan?.duration_seconds);
  const actual = Number(proof.duration_seconds);
  const reported = Number(result.duration_seconds);
  if (!(expected > 0) || !(actual > 0) || !Number.isFinite(actual) ||
      !(reported > 0) || Math.abs(actual - expected) > 0.35 ||
      Math.abs(actual - reported) > 0.05)
    throw new Error("FINAL_VIDEO_DURATION_UNVERIFIED: media length differs from the approved song.");
  const media = await verifyFinalMedia(videoUrl, job.input_snapshot?.plan?.duration_seconds);
  if (Math.abs(media.video_duration_seconds-actual)>0.05 || Math.abs(media.audio_duration_seconds-actual)>0.05) throw new Error("FINAL_VIDEO_PROBE_BYTES_MISMATCH");
  const duration = media.video_duration_seconds;
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
  // A repeated completion must preserve the creator's decision and source asset.
  const existing = await db.from("motion_clip_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
  if (existing.error) throw new Error("MOTION_CLIP_CHECK_FAILED: " + existing.error.message);
  if (existing.data) return existing.data;

  const videoUrl = extractVideoUrl(responseData);
  if (!videoUrl) throw new Error("ARENA_MOTION_OUTPUT_MISSING: Arena completed without a real video URL.");
  if (!job.visual_plan_scene_id) throw new Error("ARENA_MOTION_SCENE_MISSING: scene_motion job has no approved scene.");
  let imageQuery = db.from("scene_image_assets").select("id").eq("project_id", job.project_id).eq("visual_plan_id", job.visual_plan_id).eq("scene_id", job.visual_plan_scene_id).eq("approved", true).eq("status", "approved");
  if (job.input_snapshot?.hf_motion) imageQuery = imageQuery.eq("id", job.input_snapshot.hf_motion.source_image_id);
  const imageResult = await imageQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (imageResult.error) throw new Error("APPROVED_SCENE_IMAGE_LOOKUP_FAILED: " + imageResult.error.message);
  if (!imageResult.data?.id) throw new Error("APPROVED_SCENE_IMAGE_REQUIRED: Motion completed without an approved source image.");
  const insert = await db.from("motion_clip_assets").insert({ project_id: job.project_id, visual_plan_id: job.visual_plan_id, scene_id: job.visual_plan_scene_id, generation_job_id: job.id, scene_image_id: imageResult.data.id, provider: String(responseData?.provider || responseData?.result?.clips?.[0]?.provider || "unknown"), model: String(responseData?.model || responseData?.result?.clips?.[0]?.model || "unknown"), video_url: videoUrl, status: "generated", approved: false }).select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").single();
  if (insert.error) {
    // A concurrent completion may have inserted the job's asset first. Never
    // update that row: it may already carry an approval or rejection.
    const raceCheck = await db.from("motion_clip_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
    if (raceCheck.error) throw new Error("MOTION_CLIP_CHECK_FAILED: " + raceCheck.error.message);
    if (raceCheck.data) return raceCheck.data;
    throw new Error("MOTION_CLIP_PERSIST_FAILED: " + insert.error.message);
  }
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

  const status = String(data?.status || data?.state || data?.result?.status || data?.result?.state || "").trim().toLowerCase();

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
    // Preserve known, sanitized HF adapter codes for creator-readable failures,
    // without promoting arbitrary upstream text into error.code.
    error: { code: message.startsWith("PROVIDER_COST_UNVERIFIED:") ? "PROVIDER_COST_UNVERIFIED"
      : message.startsWith("PROVIDER_TIMEOUT:") ? "PROVIDER_TIMEOUT"
      : ["HF_GENERATION_FAILED", "HF_CAPACITY_UNAVAILABLE", "HF_QUOTA_EXHAUSTED"].includes(message) ? message
      : "ARENA_GENERATION_FAILED", message: message.slice(0, 1200), detail },
  }).eq("id", id).in("status", ["queued", "submitted", "processing"]).select("id");
  if (res.error) throw new Error("SET_FAILED_PERSIST_FAILED: " + res.error.message);
  if (!res.data || res.data.length === 0) {
    throw new Error("SET_FAILED_ZERO_ROWS_AFFECTED: Job status was not updated to failed.");
  }
}

// Read-only input preflight: no upload, approval, enqueue or GPU submission.
async function inspectApprovedImage(db: any,projectId: string,assetId: string) {
  const image=await db.from('scene_image_assets').select('id,storage_path').eq('id',assetId).eq('project_id',projectId).eq('approved',true).eq('status','approved').maybeSingle();
  const path=String(image.data?.storage_path||'');
  if(image.error || !image.data || !path.startsWith(projectId+'/scene-images/') || path.includes('..')) throw new HttpError(409,'APPROVED_STORED_IMAGE_REQUIRED','An approved privately stored image is required.');
  const signed=await db.storage.from('visual-assets').createSignedUrl(path,300);
  if(signed.error || !signed.data?.signedUrl) throw new Error('SCENE_IMAGE_SIGNING_FAILED');
  const url=new URL(signed.data.signedUrl);
  if(url.protocol!=='https:' || url.origin!==new URL(env('SUPABASE_URL')).origin) throw new Error('SCENE_IMAGE_HOST_INVALID');
  return {source_image_id: image.data.id, ...await readImage(url.href)};
}

// Append a model-specific attempt; reuse the canonical RPC's frozen lineage.
// Existing approved procedural assets/jobs are never edited or deleted.
async function enqueueHfMotion(db: any, projectId: string, sceneId: string, acceptedTerms: boolean, sourceImageId?: string, requestId?: string) {
  if (!acceptedTerms) throw new HttpError(400, "HF_TERMS_REQUIRED", "Accept the LTX model use restrictions before AI motion.");
  await hfEligibility(env("HF_VIDEO_TOKEN"));
  const scene = await db.from("visual_plan_scenes").select("id,visual_plan_id,status").eq("id", sceneId).eq("project_id", projectId).eq("status", "approved").maybeSingle();
  if (scene.error || !scene.data) throw new HttpError(409, "APPROVED_SCENE_REQUIRED", "Motion requires an approved scene.");
  const plan = await db.from("visual_plans").select("id,vision_lock_id,status").eq("id", scene.data.visual_plan_id).eq("project_id", projectId).eq("status", "approved").maybeSingle();
  if (plan.error || !plan.data?.vision_lock_id) throw new HttpError(409, "APPROVED_PLAN_REQUIRED", "Motion requires an approved locked Visual Plan.");
  let imageQuery = db.from("scene_image_assets").select("id,storage_path,image_url,generation_job_id", {count:"exact"}).eq("project_id", projectId).eq("visual_plan_id", scene.data.visual_plan_id).eq("scene_id", sceneId).eq("status", "approved").eq("approved", true);
  if (sourceImageId) imageQuery = imageQuery.eq("id", sourceImageId);
  const image = await imageQuery.order("created_at", {ascending:false}).limit(1).maybeSingle();
  if (!sourceImageId && image.count > 1) throw new HttpError(409,"SOURCE_IMAGE_CHOICE_REQUIRED","Choose the approved source image explicitly.");
  if (image.error || !image.data?.storage_path) throw new HttpError(409, "APPROVED_IMAGE_REQUIRED", "Motion requires an approved privately stored source image.");
  const template = await db.from("generation_jobs").select("*").eq("project_id", projectId).eq("visual_plan_id", scene.data.visual_plan_id).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_image").eq("id", image.data.generation_job_id).single();
  if (template.error || template.data?.status !== "completed" || template.data?.input_snapshot?.scene?.id !== sceneId || template.data.vision_lock_id !== plan.data.vision_lock_id) throw new HttpError(409, "FROZEN_LINEAGE_REQUIRED", "Approved image must have its original generation snapshot.");
  const base = template.data;
  if (requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new HttpError(400,"GENERATION_REQUEST_ID_INVALID","Invalid request ID.");
  const key = "hf-motion:" + sceneId + ":" + image.data.id + ":" + HF_MOTION.revision + (requestId ? ":variant:" + requestId : "");
  const existing = await db.from("generation_jobs").select("*").eq("project_id", projectId).eq("idempotency_key", key).maybeSingle();
  if (existing.error) throw new Error("HF_JOB_LOOKUP_FAILED");
  if (existing.data) return existing.data;
  const inserted = await db.from("generation_jobs").insert({
    project_id: projectId, vision_lock_id: base.vision_lock_id, visual_plan_id: base.visual_plan_id,
    visual_plan_scene_id: sceneId, job_type: "scene_motion", idempotency_key: key,
    input_snapshot: { ...base.input_snapshot, hf_motion: { source_image_id: image.data.id, space: HF_MOTION.space, revision: HF_MOTION.revision, duration_seconds: HF_MOTION.duration, terms_accepted_at: new Date().toISOString() } },
  }).select("*").single();
  if (inserted.error) {
    if (inserted.error.code !== "23505") throw new Error("HF_JOB_INSERT_FAILED");
    const winner = await db.from("generation_jobs").select("*").eq("project_id", projectId).eq("idempotency_key", key).single();
    if (winner.error) throw new Error("HF_JOB_INSERT_FAILED");
    return winner.data;
  }
  return inserted.data;
}

async function hfBridgeSubmit(db: any, job: any) {
  const frozen = job.input_snapshot.hf_motion;
  const image = await db.from("scene_image_assets").select("id,storage_path,status,approved").eq("id", frozen.source_image_id).eq("project_id", job.project_id).eq("visual_plan_id", job.visual_plan_id).eq("scene_id", job.visual_plan_scene_id).eq("approved", true).eq("status", "approved").single();
  if (image.error || !image.data?.storage_path) throw new Error("HF_APPROVED_SOURCE_UNAVAILABLE");
  if (frozen.revision !== HF_MOTION.revision) throw new Error("HF_SPACE_REVISION_UNAVAILABLE");
  const signed = await db.storage.from("visual-assets").createSignedUrl(image.data.storage_path, 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("HF_SOURCE_SIGNING_FAILED");
  const scene = job.input_snapshot.scene;
  const prompt = [scene.title, scene.visual_direction, scene.movement_direction, scene.location, scene.mood, scene.continuity_notes].filter(value => typeof value === "string" && value.trim()).join(". ");
  // A new append-only job yields a distinct seed; a retry of the same job cannot
  // change the seed, and the adapter still verifies free account + ZeroGPU first.
  const data = await hfSubmit(env("HF_VIDEO_TOKEN"), signed.data.signedUrl,
    prompt + ". The character moves naturally, breathes and turns their head. Fixed camera. Preserve the approved character, face, wardrobe and setting. AI-generated video.",
    hfJobSeed(job.id));
  return { response: new Response(null, { status: 200 }), data: { ...data, source_image_id: image.data.id } };
}

async function hfBridgePoll(db: any, job: any) {
  const accepted = Date.parse(job.output?.arena_response?.eligibility?.checked_at || job.created_at || "");
  if (!Number.isFinite(accepted) || Date.now() - accepted > 30 * 60 * 1000) throw new Error("HF_POLL_DEADLINE_EXCEEDED: No automatic resubmission.");
  const data: any = await hfPoll(env("HF_VIDEO_TOKEN"), job.output.upstream_job_id);
  if (data.status !== "completed") return { response: new Response(null), data };
  const path = job.project_id + "/scene-motion/" + job.visual_plan_id + "/" + job.visual_plan_scene_id + "/" + job.id + ".mp4";
  // Immutable, deterministic object: concurrent pollers reuse it, never overwrite.
  let verification: any = null;
  const existing = await db.storage.from("visual-assets").download(path);
  if (!existing.error && existing.data) {
    const { validateMp4 } = await import("./hf-motion.ts");
    verification = validateMp4(new Uint8Array(await existing.data.arrayBuffer()));
  } else {
    const downloaded = await hfDownload(data.result.video_url, env("HF_VIDEO_TOKEN"));
    verification = downloaded.verification;
    const saved = await db.storage.from("visual-assets").upload(path, downloaded.bytes, { contentType: "video/mp4", upsert: false });
    if (saved.error) {
      // A concurrent first upload is acceptable only if its real bytes validate.
      const winner = await db.storage.from("visual-assets").download(path);
      if (winner.error || !winner.data) throw new Error("HF_VIDEO_STORAGE_FAILED");
      const { validateMp4 } = await import("./hf-motion.ts");
      verification = validateMp4(new Uint8Array(await winner.data.arrayBuffer()));
    }
  }
  const signed = await db.storage.from("visual-assets").createSignedUrl(path, 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("HF_VIDEO_SIGNING_FAILED");
  return { response: new Response(null), data: { ...data, source_image_id: job.input_snapshot.hf_motion.source_image_id,
    result: { ...data.result, video_url: signed.data.signedUrl, storage_path: path, verification, ai_generated: true } } };
}

async function motionUrl(db: any, projectId: string, assetId: string) {
  const asset = await db.from("motion_clip_assets").select("id,video_url,generation_job_id,scene_id,visual_plan_id").eq("id", assetId).eq("project_id", projectId).maybeSingle();
  if (asset.error || !asset.data) throw new HttpError(404, "NOT_FOUND", "Motion asset not found.");
  const job = await db.from("generation_jobs").select("output").eq("id", asset.data.generation_job_id).eq("project_id", projectId).eq("visual_plan_scene_id", asset.data.scene_id).eq("visual_plan_id", asset.data.visual_plan_id).eq("job_type", "scene_motion").maybeSingle();
  if (job.error) throw new Error("HF_VIDEO_JOB_LOOKUP_FAILED");
  const path = job.data?.output?.arena_status_response?.result?.storage_path;
  if (!path) return asset.data.video_url;
  if (path !== projectId + "/scene-motion/" + asset.data.visual_plan_id + "/" + asset.data.scene_id + "/" + asset.data.generation_job_id + ".mp4") throw new Error("HF_VIDEO_PATH_INVALID");
  const signed = await db.storage.from("visual-assets").createSignedUrl(path, 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error("HF_VIDEO_SIGNING_FAILED");
  return signed.data.signedUrl;
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
      provider: job.input_snapshot?.hf_motion ? "huggingface-zerogpu" : "arena",
      provider_job_id: requestId,
      output: {...job.output, dispatch_started_at: new Date().toISOString()},
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
    if (job.job_type === "scene_motion" && !job.input_snapshot?.hf_motion) throw new Error("HF_FREE_MOTION_REQUIRED: Legacy motion providers are disabled for new submissions.");
    // Assembly remains on the watermarked Shotstack sandbox.
    // Arena /v2/scene-image forwards BeatVision-origin requests exclusively to
    // Cloudflare FLUX Schnell when Workers Free is explicitly confirmed; it
    // rejects missing eligibility with no Pixazo fallback. Check response
    // provenance before storing any generated image.
    const result = job.job_type === "scene_motion"
      ? job.input_snapshot?.hf_motion ? await hfBridgeSubmit(db, job) : (() => { throw new Error("HF_FREE_MOTION_REQUIRED: Legacy motion providers are disabled for new submissions."); })()
      : await arena(path, "POST", await bridgePayload(db, job), requestId);
    if (job.job_type === "scene_image" && result.response.ok && result.data?.ok !== false)
      assertVerifiedFreeSceneImageResponse(result.data);
    const state = terminalState(result.response, result.data, job.job_type);

    if (state === "failed") {
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena rejected generation."), compactArenaResponse(result.data, job.job_type));
    } else if (state === "completed") {
      if (job.job_type === "assembly") {
        const finalVideo = await persistFinalVideo(db, job, result.data);
        const updateRes = await db.from("generation_jobs").update({ status: "completed", output: { ...job.output, arena_request_id: requestId, arena_response: compactArenaResponse(result.data, job.job_type), bridge_contract: "2.0", final_video: finalVideo } }).eq("id", job.id).eq("status", "processing").select("id");
        if (updateRes.error) throw new Error("GENERATION_JOB_UPDATE_FAILED: " + updateRes.error.message);
        if (!updateRes.data || updateRes.data.length === 0) throw new Error("GENERATION_JOB_RACE_LOST: Job was modified concurrently.");
      } else {
        const persistedImage = await persistSceneImage(db, job, result.data);
        const persistedMotion = await persistMotionClip(db, job, result.data);
        const updateRes = await db.from("generation_jobs").update({ status: "completed", output: { ...job.output, arena_request_id: requestId, arena_response: compactArenaResponse(result.data, job.job_type), bridge_contract: "2.0", scene_image_asset: persistedImage || null, motion_clip_asset: persistedMotion || null } }).eq("id", job.id).eq("status", "processing").select("id");
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
            ...job.output,
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
    // Losing a conditional write means another request owns the current state.
    // Return that state instead of attempting to fail its completed job.
    if (error instanceof Error && /^(GENERATION_JOB_RACE_LOST|SET_FAILED_ZERO_ROWS_AFFECTED):/.test(error.message)) {
      const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
      if (latest.error) throw new Error(latest.error.message);
      return latest.data;
    }
    try { await setFailed(db, job.id, error instanceof Error ? error.message : String(error)); }
    catch (failure) {
      if (!(failure instanceof Error) || !failure.message.startsWith("SET_FAILED_ZERO_ROWS_AFFECTED")) throw failure;
      const winner = await db.from("generation_jobs").select("*").eq("id",job.id).single();
      if (winner.error || !winner.data || !["completed","failed"].includes(winner.data.status)) throw failure;
      return winner.data;
    }
  }

  const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
  if (latest.error) throw new Error(latest.error.message);
  return latest.data;
}

// A provider may be accepting work while its upstream ID is not yet persisted.
// Wait beyond the normal Edge Function/request window before surfacing an
// interrupted dispatch. Never resubmit work whose provider acceptance is unknown.
const DISPATCH_GRACE_MS = 5 * 60 * 1000;

async function recoverDispatch(db: any, job: any) {
  const upstream = String(job.output?.upstream_job_id || "").trim();
  const timestamp = job.updated_at || job.created_at;
  const started = Date.parse(String(timestamp || ""));
  if (!upstream && Number.isFinite(started) && Date.now() - started < DISPATCH_GRACE_MS) return job;

  const changes = upstream
    ? { status: "processing" }
    : { status: "failed", error: {
      code: "ARENA_GENERATION_FAILED",
      message: job.status === "submitted"
        ? "Generation submission was interrupted without a provider job id. Provider acceptance is unknown; automatic resubmission is disabled."
        : "Arena reported processing without a provider job id after the dispatch grace period. Provider acceptance is unknown; automatic resubmission is disabled.",
    } };
  let query = db.from("generation_jobs").update(changes).eq("id", job.id).eq("status", job.status);
  // A concurrent dispatch may have persisted an upstream ID since this read.
  // Its new row version must win over this stale recovery attempt.
  if (job.updated_at) query = query.eq("updated_at", job.updated_at);
  const result = await query.select("*").maybeSingle();
  if (result.error) throw new Error("DISPATCH_RECOVERY_PERSIST_FAILED: " + result.error.message);
  if (result.data) return result.data;
  const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
  if (latest.error) throw new Error(latest.error.message);
  return latest.data;
}

async function poll(db: any, job: any) {
  if (job.status === "submitted") return await recoverDispatch(db, job);
  if (job.status !== "processing") return job;
  const accepted = Date.parse(job.output?.dispatch_started_at || job.created_at || "");
  if (Number.isFinite(accepted) && Date.now() - accepted > 30 * 60 * 1000) {
    await setFailed(db,job.id,"PROVIDER_TIMEOUT: Maximum generation age exceeded; no new provider request was made.",job.output);
    const latest = await db.from("generation_jobs").select("*").eq("id",job.id).single();
    if(latest.error) throw new Error(latest.error.message);
    return latest.data;
  }
  const upstream = String(job.output?.upstream_job_id || "").trim();
  if (!upstream) return await recoverDispatch(db, job);

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
    const result = job.job_type === "scene_motion" && job.input_snapshot?.hf_motion
      ? await hfBridgePoll(db, job)
      : await arena(path, job.job_type === "assembly" ? "POST" : "GET", pollPayload, "beatvision:" + job.id + ":poll");
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
    // Losing a conditional write means another request owns the current state.
    // Return that state instead of attempting to fail its completed job.
    if (error instanceof Error && /^(GENERATION_JOB_RACE_LOST|SET_FAILED_ZERO_ROWS_AFFECTED):/.test(error.message)) {
      const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
      if (latest.error) throw new Error(latest.error.message);
      return latest.data;
    }
    if (job.input_snapshot?.hf_motion && (error instanceof HfMotionError && error.retryable || error instanceof TypeError)) {
      const retries = Number(job.output?.hf_poll_errors || 0) + 1;
      if (retries <= 3) {
        const updated = await db.from("generation_jobs").update({ output: { ...job.output, hf_poll_errors: retries, last_polled_at: new Date().toISOString() } }).eq("id", job.id).eq("status", "processing").eq("updated_at", job.updated_at).select("id");
        if (updated.error) throw new Error("HF_RETRY_STATE_PERSIST_FAILED");
        const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
        if (latest.error) throw new Error("HF_RETRY_STATE_READ_FAILED");
        return latest.data;
      }
    }
    try { await setFailed(db, job.id, error instanceof Error ? error.message : String(error)); }
    catch (failure) {
      if (!(failure instanceof Error) || !failure.message.startsWith("SET_FAILED_ZERO_ROWS_AFFECTED")) throw failure;
      const winner = await db.from("generation_jobs").select("*").eq("id",job.id).single();
      if (winner.error || !winner.data || !["completed","failed"].includes(winner.data.status)) throw failure;
      return winner.data;
    }
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
      // Reserve capacity for both dispatch and polling. A single oldest-first
      // query lets eight long-running provider jobs permanently starve newer
      // queued work from ever being submitted.
      const [queued, active] = await Promise.all([
        db.from("generation_jobs").select("*").eq("status", "queued").order("created_at", { ascending: true }).limit(8),
        db.from("generation_jobs").select("*").in("status", ["submitted", "processing"]).order("created_at", { ascending: true }).limit(8),
      ]);
      if (queued.error) throw new Error(queued.error.message);
      if (active.error) throw new Error(active.error.message);
      const pending = [...(queued.data || []), ...(active.data || [])]
        .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
      const results = [];
      for (const item of pending) {
        try {
          const result = item.status !== "queued" ? await poll(db, item) : await run(db, item);
          results.push({ id: item.id, action: item.status !== "queued" ? "poll" : "run", status: result.status });
        } catch (error) {
          results.push({ id: item.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return json(req, { ok: true, scanned: pending.length, results });
    }

    if (!projectId || (!["image_url", "motion_url", "enqueue_ai_motion", "motion_eligibility"].includes(action) && !jobId)) return json(req, { error: { code: "JOB_REQUIRED", message: "projectId and jobId are required." } }, 400);
    if (!["run", "poll", "image_url", "motion_url", "enqueue_ai_motion", "motion_eligibility"].includes(action)) return json(req, { error: { code: "INVALID_ACTION", message: "action must be run, poll, image_url, or drain." } }, 400);
    const project = await db.from("projects").select("id,owner_id").eq("id", projectId).maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data || (uid.kind !== "system" && project.data.owner_id !== uid.userId)) return json(req, { error: { code: "NOT_FOUND", message: "Project not found." } }, 404);

    if (action === "motion_eligibility") return json(req, {
      eligibility: await hfEligibility(env("HF_VIDEO_TOKEN")),
      source_image: body.assetId ? await inspectApprovedImage(db,projectId,String(body.assetId)) : undefined,
    });
    if (action === "enqueue_ai_motion") {
      // Same project-owner gate above applies; system is the private scheduler.
      const job = await enqueueHfMotion(db, projectId, String(body.sceneId || ""), body.acceptedTerms === true, body.sourceImageId, body.requestId);
      return json(req, { job });
    }
    if (action === "motion_url") return json(req, { video_url: await motionUrl(db, projectId, String(body.assetId || "")) });

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
