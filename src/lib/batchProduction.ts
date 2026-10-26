import type { VisualPlanScene } from "../types/visualPlan";

export type BatchKind = "image" | "motion";
export type BatchProgress = { done: number; total: number; message: string };
const records = (data: any): any[] => Array.isArray(data) ? data : data ? [data] : [];
const pending = (job: any) => ["queued", "submitted", "processing"].includes(job?.status);
function check(result: any) {
  if (result.error) throw result.error;
  return result.data;
}
export async function batchRequestId(planId: string, sceneId: string, kind: BatchKind, imageId = "") {
  // Stable across reloads and tabs. Individual regeneration keeps its separate UUID.
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    ["bragoraforge-initial-batch-v1", planId, sceneId, kind, imageId].join(":")))).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function sceneAssets(db: any, projectId: string, planId: string, sceneId: string, kind: BatchKind) {
  return records(check(await db.from(kind === "image" ? "scene_image_assets" : "motion_clip_assets")
    .select("*").eq("project_id", projectId).eq("visual_plan_id", planId).eq("scene_id", sceneId)
    .order("created_at", { ascending: false })));
}
const usable = (asset: any, kind: BatchKind) => ["generated", "approved"].includes(asset.status) &&
  Boolean(kind === "image" ? asset.storage_path || asset.image_url : asset.video_url && asset.model !== "image-motion");

export async function generateBatch({ db, projectId, planId, scenes, kind, acceptedTerms, stopped, progress, wait,
}: { db: any; projectId: string; planId: string; scenes: VisualPlanScene[]; kind: BatchKind; acceptedTerms: boolean;
  stopped: () => boolean; progress: (value: BatchProgress) => void; wait: () => Promise<void> }) {
  if (!scenes.length || scenes.some(s => s.status !== "approved")) throw new Error("Lock every scene before batch generation.");
  if (kind === "motion") {
    if (!acceptedTerms) throw new Error("Accept the LTX license before generating motion.");
    if (scenes.some(s => !Number.isFinite(Number(s.end_time)-Number(s.start_time)) || s.end_time-s.start_time <= 0 || s.end_time-s.start_time > 5.000001))
      throw new Error("Create and lock a 5-second shot revision before batch motion.");
    const probe = check(await db.functions.invoke("beatvision-generation", { body: { action: "modal_capability", projectId } }));
    if (!probe?.modal_supported || !probe?.modal_available) throw new Error("Modal GPU is unavailable. No batch motion was submitted.");
  }
  let done = 0;
  for (const scene of scenes) {
    if (stopped()) return;
    const label = `Scene ${scene.scene_number}`;
    progress({ done, total: scenes.length, message: `${label}: checking saved ${kind === "image" ? "image" : "motion"}…` });
    const assets = await sceneAssets(db, projectId, planId, scene.id, kind);
    if (assets.some(a => usable(a, kind))) {
      progress({ done: ++done, total: scenes.length, message: `${label}: existing media kept; review candidates individually.` });
      continue;
    }
    let source: any;
    if (kind === "motion") {
      const approved = (await sceneAssets(db, projectId, planId, scene.id, "image"))
        .filter(a => a.approved === true && a.status === "approved" && a.storage_path);
      if (approved.length !== 1) throw new Error(`${label}: approve exactly one stored image first. Batch paused.`);
      source = approved[0];
    }
    let job = check(await db.from("generation_jobs").select("id,status,provider,input_snapshot,error")
      .eq("project_id", projectId).eq("visual_plan_id", planId).eq("visual_plan_scene_id", scene.id)
      .eq("job_type", kind === "image" ? "scene_image" : "scene_motion")
      .order("created_at", { ascending: false }).limit(1).maybeSingle());
    if (job?.status === "failed" || (job?.status === "completed" && !assets.some(a => usable(a, kind))))
      throw new Error(`${label}: previous attempt failed or needs an individual regeneration. No automatic retry.`);
    if (!job) {
      if (stopped()) return;
      const requestId = await batchRequestId(planId, scene.id, kind, source?.id);
      if (stopped()) return;
      if (kind === "image") job = check(await db.rpc("enqueue_scene_image_variant", {
        p_project_id: projectId, p_scene_id: scene.id, p_request_id: requestId,
      }));
      else job = check(await db.functions.invoke("beatvision-generation", { body: {
        action: "enqueue_ai_motion", projectId, sceneId: scene.id, sourceImageId: source.id,
        requestId, acceptedTerms: true, provider: "modal",
      } }))?.job;
    }
    if (!job?.id) throw new Error(`${label}: no saved job was returned. Batch paused.`);
    if (kind === "motion" && (!job.input_snapshot?.modal_motion ||
        job.input_snapshot.modal_motion.source_image_id !== source.id))
      throw new Error(`${label}: existing job uses a different motion provider or source. Review it individually.`);
    // Only one batch job is dispatched at a time. The persisted job can finish via
    // the existing scheduler if this page closes; later scenes require Resume.
    for (let polls = 0; pending(job) && polls < 120; polls++) {
      if (stopped()) return;
      progress({ done, total: scenes.length, message: `${label}: ${job.status}…` });
      const next = check(await db.functions.invoke("beatvision-generation", { body: {
        projectId, jobId: job.id, action: job.status === "queued" ? "run" : "poll",
      } }))?.job;
      if (!next?.id || next.id !== job.id) throw new Error(`${label}: job status unavailable. Resume checks the saved attempt.`);
      job = next;
      if (pending(job)) await wait();
    }
    if (stopped()) return;
    if (job.status !== "completed") throw new Error(`${label}: ${job.status}. Batch paused; no later scene was submitted. Review the saved job.`);
    const saved = await sceneAssets(db, projectId, planId, scene.id, kind);
    if (!saved.some(a => usable(a, kind) && a.generation_job_id === job.id))
      throw new Error(`${label}: completed job has no saved media yet. Batch paused.`);
    progress({ done: ++done, total: scenes.length, message: `${label}: media saved. Awaiting your approval.` });
  }
}

export async function approvalCandidates(db: any, projectId: string, planId: string, scenes: VisualPlanScene[], kind: BatchKind) {
  const candidates: { scene: VisualPlanScene; asset: any }[] = [];
  for (const scene of scenes) {
    const assets = await sceneAssets(db, projectId, planId, scene.id, kind);
    // Bulk approval never replaces an already approved take.
    if (assets.some(a => a.status === "approved" && a.approved)) continue;
    const asset = assets.find(a => a.status === "generated" && !a.approved && usable(a, kind));
    if (asset) candidates.push({ scene, asset });
  }
  return candidates;
}
export async function approveBatch({ db, projectId, planId, kind, candidates, stopped, progress }:
  { db: any; projectId: string; planId: string; kind: BatchKind; candidates: {scene: VisualPlanScene; asset: any}[];
    stopped: () => boolean; progress: (value: BatchProgress) => void }) {
  let done = 0;
  for (const { scene, asset } of candidates) {
    if (stopped()) return;
    // Recheck the review snapshot immediately before each creator-authorized approval.
    const current = await sceneAssets(db, projectId, planId, scene.id, kind);
    const approved = current.find(a => a.status === "approved" && a.approved);
    if (approved?.id === asset.id) {
      progress({done: ++done, total: candidates.length, message: `Scene ${scene.scene_number}: approval already saved.`});
      continue;
    }
    if (approved || !current.some(a => a.id === asset.id && a.status === "generated" && !a.approved && usable(a, kind)))
      throw new Error(`Scene ${scene.scene_number}: selection changed. Review again; no take was replaced.`);
    if (stopped()) return;
    const selected = check(await db.rpc(kind === "image" ? "approve_scene_image_asset" : "approve_motion_clip_asset", { p_asset_id: asset.id }));
    if (selected?.id !== asset.id || selected.approved !== true || selected.status !== "approved")
      throw new Error(`Scene ${scene.scene_number}: approval was not confirmed. Review saved status before continuing.`);
    progress({ done: ++done, total: candidates.length, message: `Scene ${scene.scene_number}: approval saved.` });
  }
}
