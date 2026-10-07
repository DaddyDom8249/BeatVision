import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function env(name: string) { return String(Deno.env.get(name) || "").trim(); }

function admin() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

async function authenticate(req: Request) {
  const queueSecret = String(req.headers.get("X-BeatVision-Queue-Secret") || "").trim();
  if (queueSecret) {
    const db = admin();
    const config = await db.schema("private").from("beatvision_generation_scheduler_config").select("queue_secret").maybeSingle();
    if (config.error) throw new HttpError(500, "SCHEDULER_CONFIG_FAILED", config.error.message);
    if (config.data?.queue_secret && queueSecret === config.data.queue_secret) return { kind: "system" as const, userId: null };
  }

  const token = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(token)) throw new HttpError(401, "UNAUTHENTICATED", "Authentication required.");

  // The production scheduler uses the server-only Supabase service-role key.
  // It is never exposed to the browser and is accepted only for system queue
  // work; normal requests still require a real authenticated user session.
  const bearer = token.replace(/^Bearer\s+/i, "").trim();
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole && bearer === serviceRole) return { kind: "system" as const, userId: null };

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
    const imageResult = await db.from("scene_image_assets").select("id,image_url,scene_id,status,approved,created_at").eq("project_id", job.project_id).eq("visual_plan_id", job.visual_plan_id).eq("scene_id", job.visual_plan_scene_id).eq("approved", true).eq("status", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (imageResult.error) throw new Error("APPROVED_SCENE_IMAGE_LOOKUP_FAILED: " + imageResult.error.message);
    if (!imageResult.data?.image_url || !/^https?:\/\//i.test(String(imageResult.data.image_url))) throw new Error("APPROVED_SCENE_IMAGE_REQUIRED: Motion requires an approved real scene image.");
    images = { images: [{ image_url: String(imageResult.data.image_url), scene_id: String(imageResult.data.scene_id), approved: true }] };
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
  const imageUrl = extractImageUrl(responseData);
  if (!imageUrl) throw new Error("ARENA_IMAGE_OUTPUT_MISSING: Arena completed without a real image URL.");
  if (!job.visual_plan_scene_id) throw new Error("ARENA_IMAGE_SCENE_MISSING: scene_image job has no approved scene.");
  const insert = await db.from("scene_image_assets").insert({
    project_id: job.project_id,
    visual_plan_id: job.visual_plan_id,
    scene_id: job.visual_plan_scene_id,
    generation_job_id: job.id,
    provider: "arena",
    model: modelFor(job.job_type) || "unknown",
    image_url: imageUrl,
    status: "generated",
    approved: false,
  }).select("id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved,created_at,updated_at").single();
  if (insert.error) throw new Error("SCENE_IMAGE_PERSIST_FAILED: " + insert.error.message);
  return insert.data;
}

async function persistFinalVideo(db: any, job: any, responseData: any) {
  if (job.job_type !== "assembly") return;
  const videoUrl = extractVideoUrl(responseData);
  if (!videoUrl) throw new Error("FINAL_VIDEO_OUTPUT_MISSING: Shotstack completed without a real video URL.");
  const duration = Number(responseData?.result?.duration_seconds || responseData?.duration_seconds || job.input_snapshot?.plan?.duration_seconds || 0);
  const finalInsert = await db.from("final_videos").insert({ project_id: job.project_id, title: String(job.input_snapshot?.plan?.title || "BeatVision Final Video"), video_url: videoUrl, preview_video_url: videoUrl, audio_file: String(job.input_snapshot?.audio_path || ""), duration: Number.isFinite(duration) && duration > 0 ? duration : null, format: "mp4", quality: "hd", render_status: "complete", downloadable: false, segment_count: Array.isArray(job.input_snapshot?.scenes) ? job.input_snapshot.scenes.length : null }).select("id,project_id,video_url,preview_video_url,duration,format,quality,render_status,downloadable,segment_count,created_at,updated_at").single();
  if (finalInsert.error) throw new Error("FINAL_VIDEO_PERSIST_FAILED: " + finalInsert.error.message);
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
  const insert = await db.from("motion_clip_assets").upsert({ project_id: job.project_id, visual_plan_id: job.visual_plan_id, scene_id: job.visual_plan_scene_id, generation_job_id: job.id, scene_image_id: imageResult.data.id, provider: "arena", model: modelFor(job.job_type) || "unknown", video_url: videoUrl, status: "generated", approved: false }, { onConflict: "generation_job_id" }).select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").single();
  if (insert.error) throw new Error("MOTION_CLIP_PERSIST_FAILED: " + insert.error.message);
  return insert.data;
}

function terminalState(response: Response, data: any, jobType?: string) {
  if (!response.ok) return "failed";

  const status = String(data?.status || data?.state || "").trim().toLowerCase();

  // Arena's BeatVision scene-image bridge is synchronous: it waits for the
  // Pixazo Flux Schnell result and returns the real image URL in the same
  // successful response. It intentionally does not manufacture a provider
  // job/status for the controller to poll.
  if (jobType === "scene_image" && extractImageUrl(data)) return "completed";
  if (["failed", "error", "provider_error", "provider_unavailable", "unavailable", "cancelled", "canceled"].includes(status)) return "failed";
  if (["processing", "submitted", "queued", "pending", "running", "in_progress"].includes(status)) return "processing";

  // A successful HTTP response is not proof that media is complete.  Require
  // an explicit terminal-success state so an unrecognised provider response
  // cannot be persisted as a completed job without real output.
  if (["completed", "complete", "succeeded", "success", "done", "finished"].includes(status)) return "completed";

  return "processing";
}

async function setFailed(db: any, id: string, message: string, detail?: unknown) {
  await db.from("generation_jobs").update({
    status: "failed",
    error: { code: "ARENA_GENERATION_FAILED", message: message.slice(0, 1200), detail },
  }).eq("id", id).in("status", ["queued", "submitted", "processing"]);
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
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena rejected generation."), result.data);
    } else if (state === "completed") {
      if (job.job_type === "assembly") {
        const finalVideo = await persistFinalVideo(db, job, result.data);
        await db.from("generation_jobs").update({ status: "completed", output: { arena_request_id: requestId, arena_response: result.data, bridge_contract: "2.0", final_video: finalVideo } }).eq("id", job.id).eq("status", "processing");
      } else {
        const persistedImage = await persistSceneImage(db, job, result.data);
        const persistedMotion = await persistMotionClip(db, job, result.data);
        await db.from("generation_jobs").update({ status: "completed", output: { arena_request_id: requestId, arena_response: result.data, bridge_contract: "2.0", scene_image_asset: persistedImage || null, motion_clip_asset: persistedMotion || null } }).eq("id", job.id).eq("status", "processing");
      }
    } else {
      const upstreamJobId = job.job_type === "assembly"
        ? String(extractRenderId(result.data) || "").trim()
        : String(result.data?.job_id || result.data?.provider_job_id || result.data?.id || "").trim();
      await db.from("generation_jobs").update({
        output: {
          arena_request_id: requestId,
          upstream_job_id: upstreamJobId || null,
          arena_response: result.data,
          bridge_contract: "2.0",
        },
      }).eq("id", job.id).eq("status", "processing");
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
  if (!upstream) throw new Error("Arena reported processing without a provider job id.");

  const path = job.job_type === "scene_motion"
    ? "/v1/video/animate/jobs/" + encodeURIComponent(upstream)
    : job.job_type === "assembly"
      ? "/v1/video/assemble/status/" + encodeURIComponent(upstream)
      : null;
  if (!path) return job;

  try {
    const pollPayload = job.job_type === "assembly" ? { target_duration_seconds: Number(job.input_snapshot?.plan?.duration_seconds || 0) } : null;
    const result = await arena(path, job.job_type === "assembly" ? "POST" : "GET", pollPayload, "beatvision:" + job.id + ":poll");
    const state = terminalState(result.response, result.data);
    if (state === "failed") {
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena provider job failed."), result.data);
    } else if (state === "completed") {
      if (job.job_type === "scene_motion") {
        const persistedMotion = await persistMotionClip(db, job, result.data);
        await db.from("generation_jobs").update({ status: "completed", output: { ...(job.output || {}), arena_status_response: result.data, motion_clip_asset: persistedMotion || null } }).eq("id", job.id).eq("status", "processing");
      } else if (job.job_type === "assembly") {
        const finalVideo = await persistFinalVideo(db, job, result.data);
        await db.from("generation_jobs").update({ status: "completed", output: { ...(job.output || {}), arena_status_response: result.data, final_video: finalVideo } }).eq("id", job.id).eq("status", "processing");
      }
    } else {
      await db.from("generation_jobs").update({
        output: { ...(job.output || {}), arena_status_response: result.data, last_polled_at: new Date().toISOString() },
      }).eq("id", job.id).eq("status", "processing");
    }
  } catch (error) {
    await setFailed(db, job.id, error instanceof Error ? error.message : String(error));
  }

  const latest = await db.from("generation_jobs").select("*").eq("id", job.id).single();
  if (latest.error) throw new Error(latest.error.message);
  return latest.data;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required." }, 405);
  try {
    const uid = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const projectId = String(body.projectId || body.project_id || "");
    const jobId = String(body.jobId || body.job_id || "");
    const action = String(body.action || "run");
    const db = admin();

    if (action === "drain") {
      if (uid.kind !== "system") return json({ error: { code: "UNAUTHORIZED_SCHEDULER", message: "Scheduler authorization required." } }, 401);
      const pending = await db.from("generation_jobs").select("id,project_id,status").in("status", ["queued", "processing"]).order("created_at", { ascending: true }).limit(8);
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
      return json({ ok: true, scanned: (pending.data || []).length, results });
    }

    if (!projectId || !jobId) return json({ error: { code: "JOB_REQUIRED", message: "projectId and jobId are required." } }, 400);
    if (!["run", "poll"].includes(action)) return json({ error: { code: "INVALID_ACTION", message: "action must be run, poll, or drain." } }, 400);
    const project = await db.from("projects").select("id,owner_id").eq("id", projectId).maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data || (uid.kind !== "system" && project.data.owner_id !== uid.userId)) return json({ error: { code: "NOT_FOUND", message: "Project not found." } }, 404);

    const job = await db.from("generation_jobs").select("*").eq("id", jobId).eq("project_id", projectId).maybeSingle();
    if (job.error) throw new Error(job.error.message);
    if (!job.data) return json({ error: { code: "NOT_FOUND", message: "Generation job not found." } }, 404);

    const result = action === "poll" ? await poll(db, job.data) : await run(db, job.data);
    return json({ job: result });
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    return json({ error: { code: "GENERATION_CONTROLLER_FAILED", message: error instanceof Error ? error.message : String(error) } }, 500);
  }
});
