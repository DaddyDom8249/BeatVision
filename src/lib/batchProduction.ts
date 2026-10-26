import type { VisualPlanScene } from "../types/visualPlan";

export type BatchKind = "image" | "motion";
export type BatchProgress = { done: number; total: number; message: string };
const records = (data: any): any[] => Array.isArray(data) ? data : data ? [data] : [];
function check(result: any) {
  if (result.error) throw result.error;
  return result.data;
}
export async function sceneAssets(db: any, projectId: string, planId: string, sceneId: string, kind: BatchKind) {
  return records(check(await db.from(kind === "image" ? "scene_image_assets" : "motion_clip_assets")
    .select("*").eq("project_id", projectId).eq("visual_plan_id", planId).eq("scene_id", sceneId)
    .order("created_at", { ascending: false })));
}
const usable = (asset: any, kind: BatchKind) => ["generated", "approved"].includes(asset.status) &&
  Boolean(kind === "image" ? asset.storage_path || asset.image_url : asset.video_url && asset.model !== "image-motion");

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
