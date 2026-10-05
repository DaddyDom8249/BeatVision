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

function userClient(token: string) {
  return createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY"),
    { global: { headers: { Authorization: token } } },
  );
}

async function authenticate(req: Request) {
  const token = req.headers.get("Authorization") || "";
  if (!/^Bearer\\s+\\S+$/i.test(token)) throw new Error("Authentication required.");
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

function extractSceneImage(result: any) {
  const candidates = [
    result?.result?.images?.[0]?.image_url,
    result?.result?.images?.[0]?.url,
    result?.result?.image_url,
    result?.result?.url,
    result?.image_url,
    result?.url,
  ];
  const imageUrl = candidates.find((value: unknown) => typeof value === "string" && /^https?:\/\//i.test(value));
  if (!imageUrl) throw new Error("Arena scene-image completion contained no usable image URL.");

  const image = result?.result?.images?.[0] || result?.result || result;
  return {
    image_url: imageUrl,
    provider: String(result?.provider || "pixazo"),
    model: String(image?.model || result?.model || "flux-schnell"),
  };
}

function extractMotionClip(result: any) {
  const candidates = [
    result?.result?.videos?.[0]?.video_url,
    result?.result?.videos?.[0]?.url,
    result?.result?.video_url,
    result?.result?.url,
    result?.video_url,
    result?.url,
  ];
  const videoUrl = candidates.find((value: unknown) => typeof value === "string" && /^https?:\/\//i.test(value));
  if (!videoUrl) throw new Error("Arena scene-motion completion contained no usable video URL.");
  const video = result?.result?.videos?.[0] || result?.result || result;
  return {
    video_url: videoUrl,
    provider: String(result?.provider || "pixazo"),
    model: String(video?.model || result?.model || "ltx-video"),
  };
}

async function persistMotionClip(db: any, job: any, arenaResponse: any) {
  if (job.job_type !== "scene_motion") return;
  const sceneId = String(job.visual_plan_scene_id || job.input_snapshot?.visual_plan_scene_id || "").trim();
  const visualPlanId = String(job.visual_plan_id || job.input_snapshot?.visual_plan_id || "").trim();
  if (!sceneId || !visualPlanId) throw new Error("Completed scene-motion job is missing frozen Scene/Visual Plan lineage.");
  const media = extractMotionClip(arenaResponse);
  const existing = await db.from("motion_clips")
    .select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved")
    .eq("generation_job_id", job.id)
    .maybeSingle();
  if (existing.error) throw new Error("Motion clip lookup failed: " + existing.error.message);
  if (existing.data) return existing.data;
  const inserted = await db.from("motion_clips").insert({
    project_id: job.project_id,
    visual_plan_id: visualPlanId,
    scene_id: sceneId,
    generation_job_id: job.id,
    provider: media.provider,
    model: media.model,
    video_url: media.video_url,
    status: "generated",
    approved: false,
  }).select("*").single();
  if (inserted.error) throw new Error("Motion clip persistence failed: " + inserted.error.message);
  return inserted.data;
}

async function persistSceneImage(db: any, job: any, arenaResponse: any) {
  if (job.job_type !== "scene_image") return;

  const sceneId = String(job.visual_plan_scene_id || job.input_snapshot?.visual_plan_scene_id || "").trim();
  const visualPlanId = String(job.visual_plan_id || job.input_snapshot?.visual_plan_id || "").trim();
  if (!sceneId || !visualPlanId) throw new Error("Completed scene-image job is missing frozen Scene/Visual Plan lineage.");

  const media = extractSceneImage(arenaResponse);

  const existing = await db.from("scene_images")
    .select("id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved")
    .eq("generation_job_id", job.id)
    .maybeSingle();

  if (existing.error) throw new Error("Scene image lookup failed: " + existing.error.message);
  if (existing.data) return existing.data;

  const inserted = await db.from("scene_images").insert({
    project_id: job.project_id,
    visual_plan_id: visualPlanId,
    scene_id: sceneId,
    generation_job_id: job.id,
    provider: media.provider,
    model: media.model,
    image_url: media.image_url,
    status: "generated",
    approved: false,
  }).select("*").single();

  if (inserted.error) throw new Error("Scene image persistence failed: " + inserted.error.message);
  return inserted.data;
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
      const sceneImage = job.job_type === "scene_image"
        ? await persistSceneImage(db, job, result.data)
        : null;
      const motionClip = job.job_type === "scene_motion"
        ? await persistMotionClip(db, job, result.data)
        : null;

      const completion = await db.from("generation_jobs").update({
        status: "completed",
        output: {
          arena_request_id: requestId,
          arena_response: result.data,
          bridge_contract: "2.0",
          ...(sceneImage ? { scene_image_id: sceneImage.id } : {}),
          ...(motionClip ? { motion_clip_id: motionClip.id } : {}),
        },
      }).eq("id", job.id).eq("status", "processing");

      if (completion.error) throw new Error(completion.error.message);
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
    const authorization = req.headers.get("Authorization") || "";
    const uid = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "run");

    if (action === "approve_and_enqueue") {
      const projectId = String(body.projectId || body.project_id || "").trim();
      const visualPlanId = String(body.visualPlanId || body.visual_plan_id || "").trim();

      if (!projectId || !visualPlanId) {
        return json({
          success: false,
          error: {
            code: "INVALID_REQUEST_PAYLOAD",
            stage: "validation",
            message: "project_id and visual_plan_id are required.",
          },
        }, 400);
      }

      // Keep creative orchestration on a caller-scoped client. The worker's
      // service-role client must remain isolated to run()/poll() lifecycle writes.
      const supabaseUser = userClient(authorization);

      // Defense in depth: prove the authenticated caller owns the project before
      // invoking either creative RPC. The RPCs remain the authoritative database
      // authorization boundary.
      const projectCheck = await supabaseUser
        .from("projects")
        .select("id")
        .eq("id", projectId)
        .eq("owner_id", uid)
        .maybeSingle();

      if (projectCheck.error) throw new Error(projectCheck.error.message);
      if (!projectCheck.data) {
        return json({
          success: false,
          error: { code: "PROJECT_NOT_FOUND_OR_FORBIDDEN", stage: "authorization" },
        }, 403);
      }

      // Fail closed if the plan is not attached to the authorized project.
      const planCheck = await supabaseUser
        .from("visual_plans")
        .select("id")
        .eq("id", visualPlanId)
        .eq("project_id", projectId)
        .maybeSingle();

      if (planCheck.error) throw new Error(planCheck.error.message);
      if (!planCheck.data) {
        return json({
          success: false,
          error: { code: "VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN", stage: "authorization" },
        }, 403);
      }

      // Phase 1: approve the creative state using the caller's auth.uid()
      // context. This remains SECURITY INVOKER in the live database.
      const approval = await supabaseUser.rpc("approve_visual_plan", {
        p_plan_id: visualPlanId,
      });

      if (approval.error) {
        return json({
          success: false,
          error: {
            code: approval.error.code === "P0001"
              ? "VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN"
              : "APPROVAL_TRANSACTION_FAILED",
            stage: "approval",
            detail: approval.error.message,
          },
        }, 400);
      }

      // Phase 2: re-read committed state after the approval RPC. This is a
      // separate committed database request, not a cross-request transaction.
      const sceneFetch = await supabaseUser
        .from("visual_plan_scenes")
        .select("id")
        .eq("visual_plan_id", visualPlanId)
        .order("scene_number", { ascending: true });

      if (sceneFetch.error || !sceneFetch.data) {
        return json({
          success: false,
          error: {
            code: "SCENE_ENUMERATION_FAILED",
            stage: "orchestration",
            detail: sceneFetch.error?.message,
          },
        }, 500);
      }

      if (sceneFetch.data.length === 0) {
        return json({
          success: false,
          error: {
            code: "NO_SCENES_TO_ENQUEUE",
            stage: "orchestration",
          },
        }, 409);
      }

      // Phase 3: each enqueue is deterministic and idempotent. If a later
      // scene fails, already-created jobs remain recoverable by retrying this
      // same action.
      const jobIds: string[] = [];

      for (const scene of sceneFetch.data) {
        const enqueue = await supabaseUser.rpc("enqueue_scene_generation", {
          p_project_id: projectId,
          p_scene_id: scene.id,
          p_job_type: "scene_image",
        });

        if (enqueue.error) {
          return json({
            success: false,
            status: "partial",
            project_id: projectId,
            visual_plan_id: visualPlanId,
            jobs: jobIds,
            error: {
              code: "GENERATION_ENQUEUE_FAILED",
              stage: "enqueue",
              scene_id: scene.id,
              detail: enqueue.error.message,
            },
          }, 502);
        }

        const jobRecord = Array.isArray(enqueue.data)
          ? enqueue.data[0]
          : enqueue.data;

        if (!jobRecord?.id) {
          return json({
            success: false,
            status: "partial",
            project_id: projectId,
            visual_plan_id: visualPlanId,
            jobs: jobIds,
            error: {
              code: "GENERATION_ENQUEUE_INVALID_RESPONSE",
              stage: "enqueue",
              scene_id: scene.id,
            },
          }, 502);
        }

        jobIds.push(String(jobRecord.id));
      }

      return json({
        success: true,
        status: "synchronized",
        project_id: projectId,
        visual_plan_id: visualPlanId,
        jobs: jobIds,
      });
    }

    if (!["run", "poll"].includes(action)) {
      return json({
        error: {
          code: "INVALID_ACTION",
          message: "action must be run, poll, or approve_and_enqueue.",
        },
      }, 400);
    }

    const projectId = String(body.projectId || body.project_id || "");
    const jobId = String(body.jobId || body.job_id || "");
    if (!projectId || !jobId) {
      return json({
        error: {
          code: "JOB_REQUIRED",
          message: "projectId and jobId are required.",
        },
      }, 400);
    }

    // Worker path deliberately uses the privileged client. Direct generation_jobs
    // lifecycle writes are restricted from authenticated/anon and are not moved
    // into the user-scoped orchestration client.
    const db = admin();
    const project = await db
      .from("projects")
      .select("id,owner_id")
      .eq("id", projectId)
      .maybeSingle();

    if (project.error) throw new Error(project.error.message);
    if (!project.data || project.data.owner_id !== uid) {
      return json({
        error: { code: "NOT_FOUND", message: "Project not found." },
      }, 404);
    }

    const job = await db
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (job.error) throw new Error(job.error.message);
    if (!job.data) {
      return json({
        error: { code: "NOT_FOUND", message: "Generation job not found." },
      }, 404);
    }

    const result = action === "poll"
      ? await poll(db, job.data)
      : await run(db, job.data);

    return json({ job: result });
  } catch (error) {
    return json({
      error: {
        code: "GENERATION_CONTROLLER_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
    }, 500);
  }
});
