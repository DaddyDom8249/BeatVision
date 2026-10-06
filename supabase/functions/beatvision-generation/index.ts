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
  const token = req.headers.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(token)) throw new Error("Authentication required.");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"), {
    global: { headers: { Authorization: token } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Invalid or expired authentication session.");
  return data.user.id;
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

function bridgePayload(job: any) {
  const snapshot = job.input_snapshot || {};
  const lock = snapshot.vision_snapshot || {};
  const song = lock.song || {};
  const world = lock.world || {};
  const style = lock.style_bible || {};
  const analysis = song.analysis && typeof song.analysis === "object" ? song.analysis : {};
  const scene = snapshot.scene;

  if (!scene) throw new Error("Frozen Scene Direction is missing.");
  const duration = Number(analysis.duration_seconds ?? snapshot.plan?.duration_seconds ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Frozen song duration is missing.");

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
  return candidates.find((value) => typeof value === "string" && /^https?:\\/\\//i.test(value.trim()))?.trim() || null;
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

function terminalState(response: Response, data: any) {
  if (!response.ok) return "failed";
  const status = String(data?.status || data?.state || "").toLowerCase();
  if (["failed", "error", "provider_error", "provider_unavailable", "unavailable"].includes(status)) return "failed";
  if (["processing", "submitted", "queued", "pending", "running"].includes(status)) return "processing";
  return "completed";
}

async function setFailed(db: any, id: string, message: string, detail?: unknown) {
  await db.from("generation_jobs").update({
    status: "failed",
    error: { code: "ARENA_GENERATION_FAILED", message: message.slice(0, 1200), detail },
  }).eq("id", id).in("status", ["queued", "submitted", "processing"]);
}

async function run(db: any, job: any) {
  if (!["scene_image", "scene_motion"].includes(String(job.job_type))) {
    throw new Error("GENERATION_JOB_TYPE_NOT_SUPPORTED: only scene_image and scene_motion are controller-backed.");
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
    const path = job.job_type === "scene_image" ? "/v2/scene-image" : "/v2/animate";
    const result = await arena(path, "POST", bridgePayload(job), requestId);
    const state = terminalState(result.response, result.data);

    if (state === "failed") {
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena rejected generation."), result.data);
    } else if (state === "completed") {
      const persisted = await persistSceneImage(db, job, result.data);
      await db.from("generation_jobs").update({
        status: "completed",
        output: { arena_request_id: requestId, arena_response: result.data, bridge_contract: "2.0", scene_image_asset: persisted || null },
      }).eq("id", job.id).eq("status", "processing");
    } else {
      const upstreamJobId = String(result.data?.job_id || result.data?.provider_job_id || result.data?.id || "").trim();
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

  // Compatibility only: the deployed Arena currently exposes v1 status routes.
  // This detail is isolated here and can be removed when v2 status routes land.
  const path = job.job_type === "scene_motion"
    ? "/v1/video/animate/jobs/" + encodeURIComponent(upstream)
    : null;
  if (!path) return job;

  try {
    const result = await arena(path, "GET", null, "beatvision:" + job.id + ":poll");
    const state = terminalState(result.response, result.data);
    if (state === "failed") {
      await setFailed(db, job.id, String(result.data?.error?.message || result.data?.error || "Arena provider job failed."), result.data);
    } else if (state === "completed") {
      await db.from("generation_jobs").update({
        status: "completed",
        output: { ...(job.output || {}), arena_status_response: result.data },
      }).eq("id", job.id).eq("status", "processing");
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
    if (!projectId || !jobId) return json({ error: { code: "JOB_REQUIRED", message: "projectId and jobId are required." } }, 400);
    if (!["run", "poll"].includes(action)) return json({ error: { code: "INVALID_ACTION", message: "action must be run or poll." } }, 400);

    const db = admin();
    const project = await db.from("projects").select("id,owner_id").eq("id", projectId).maybeSingle();
    if (project.error) throw new Error(project.error.message);
    if (!project.data || project.data.owner_id !== uid) return json({ error: { code: "NOT_FOUND", message: "Project not found." } }, 404);

    const job = await db.from("generation_jobs").select("*").eq("id", jobId).eq("project_id", projectId).maybeSingle();
    if (job.error) throw new Error(job.error.message);
    if (!job.data) return json({ error: { code: "NOT_FOUND", message: "Generation job not found." } }, 404);

    const result = action === "poll" ? await poll(db, job.data) : await run(db, job.data);
    return json({ job: result });
  } catch (error) {
    return json({ error: { code: "GENERATION_CONTROLLER_FAILED", message: error instanceof Error ? error.message : String(error) } }, 500);
  }
});
