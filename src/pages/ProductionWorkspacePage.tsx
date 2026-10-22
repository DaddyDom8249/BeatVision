import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase/client";
import { formatCreativeText, getCreativeErrorMessage } from "../lib/formatCreativeText";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";
import StudioHeader from "../components/navigation/StudioHeader";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";
const imageFields = "id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved,created_at,updated_at";
const SIGNED_MEDIA_REUSE_MS = 50 * 60 * 1000; // Supabase signs clips and images for 60 minutes.

/** Legacy completed renders may reside only at an external Shotstack stage URL.
 * This is an explicit, owner-initiated read-only recovery link, never proof that
 * the provider still hosts the file or that BeatVision owns a durable export.
 */
function legacyRenderHref(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" ||
        url.hostname !== "shotstack-api-stage-output.s3-ap-southeast-2.amazonaws.com" ||
        url.username || url.password || url.port || url.search || url.hash ||
        !/^\/[a-z0-9_-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4$/i.test(url.pathname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Candidate only: Shotstack status S3 output expires after 24 h.
 * A separately hosted stage CDN copy may remain. Never accept arbitrary URLs.
 */
function hostedShotstackRenderHref(value: unknown): string | null {
  const temporary = legacyRenderHref(value);
  if (!temporary) return null;
  return "https://cdn.shotstack.io/au/stage" + new URL(temporary).pathname;
}

function productionErrorMessage(error: unknown) {
  const message = typeof error === "string" ? error : getCreativeErrorMessage(error, "Production request failed.");
  if (message.includes("ASSEMBLY_MOTION_NOT_FULLY_APPROVED")) {
    return "Approve a real motion clip for every scene before assembling the final video.";
  }
  if (/\bHF_QUOTA_EXHAUSTED\b/.test(message)) {
    return "Hugging Face free GPU quota is exhausted. Try after the free allowance resets. No paid provider or automatic retry was used.";
  }
  if (/\bHF_CAPACITY_UNAVAILABLE\b/.test(message)) {
    return "Hugging Face could not render motion because the free GPU was unavailable or out of memory. Existing clips are safe. Try a new variant manually when capacity returns; no automatic retry was sent.";
  }
  if (/\bHF_GENERATION_FAILED\b/.test(message)) {
    return "Hugging Face accepted the motion job but did not produce a video. The approved image and saved clips are unchanged. You can generate another 2-second motion variant manually; no automatic retry was sent.";
  }
  return message;
}

/** Read the Edge Function's JSON error instead of hiding it behind FunctionsHttpError. */
async function motionPilotErrorMessage(reason: unknown): Promise<string> {
  const context = (reason as { context?: { json?: () => Promise<unknown>; status?: number } } | null)?.context;
  if (context && typeof context.json === "function") {
    try {
      const json = await context.json();
      if (json && typeof json === "object") {
        const data = json as Record<string, unknown>;
        const detail = typeof data.error === "string" ? data.error :
          typeof data.message === "string" ? data.message : "";
        if (detail) return detail.slice(0, 400);
      }
    } catch { /* Non-JSON responses still receive a useful status message. */ }
  }
  if (context?.status === 401) return "Motion session expired or unauthorized. Sign in again and retry.";
  if (context?.status === 403) return "The selected scene is not owned by this signed-in account.";
  if (context?.status === 429) return "The free ZeroGPU queue is currently limited. Try again after the free quota resets.";
  if (context?.status === 503) return "The free AI motion service is unavailable. No paid fallback was attempted.";
  return productionErrorMessage(reason);
}

function time(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

/** Drop only an auto-generated numeric range from the DISPLAY title, never the saved title. */
function readableSceneTitle(scene: VisualPlanScene): string {
  const match = /^((?:Section|Scene)\s+\d+)\s*\(\s*\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*s\s*\)$/i.exec(scene.title.trim());
  return match?.[1] ?? scene.title;
}

function prompt(scene: VisualPlanScene) {
  return [
    "SCENE " + scene.scene_number + ": " + readableSceneTitle(scene),
    "TIME: " + time(scene.start_time) + "–" + time(scene.end_time),
    "LOCATION: " + formatCreativeText(scene.location),
    "MOOD: " + formatCreativeText(scene.mood),
    "VISUAL: " + formatCreativeText(scene.visual_direction),
    "CAMERA: " + formatCreativeText(scene.camera_direction),
    "MOVEMENT: " + formatCreativeText(scene.movement_direction),
    "MUSICAL / LYRIC MOMENT: " + (formatCreativeText(scene.lyric_moment) || "Follow the analyzed musical section."),
    "TRANSITION: " + formatCreativeText(scene.transition_style),
    "CONTINUITY: " + formatCreativeText(scene.continuity_notes),
  ].join("\n");
}

export default function ProductionWorkspacePage({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const [scenes, setScenes] = useState<VisualPlanScene[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [image, setImage] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [motion, setMotion] = useState<any>(null);
  const [motionMeasured, setMotionMeasured] = useState<{ assetId: string; seconds: number } | null>(null);
  const [pilotMeasured, setPilotMeasured] = useState<{ url: string; seconds: number } | null>(null);
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [motionProvider, setMotionProvider] = useState<"huggingface" | "modal">("huggingface");
  // Wan ZeroGPU start returns WAN_ELIGIBILITY_UNVERIFIED. Do not submit.
  const wanPreviewEligibilityVerified = false;
  const [freePilotBusy, setFreePilotBusy] = useState(false);
  const [freePilotChecking, setFreePilotChecking] = useState(false);
  const freePilotPollingRef = useRef(false);
  const [freePilotStatusMessage, setFreePilotStatusMessage] = useState<string | null>(null);
  const [freePilotUrl, setFreePilotUrl] = useState<string | null>(null);
  const [freePilotJob, setFreePilotJob] = useState<{ token: string; sceneId: string } | null>(null);
  const [freePilotError, setFreePilotError] = useState<string | null>(null);
  const [finalVideo, setFinalVideo] = useState<any>(null);
  const [assemblyJob, setAssemblyJob] = useState<any>(null);
  const [assemblyRunning, setAssemblyRunning] = useState(false);
  const [assemblyReadiness, setAssemblyReadiness] = useState({ ready: false, message: "Checking approved motion clips…" });
  const [downloading, setDownloading] = useState(false);
  const [finalPlayback, setFinalPlayback] = useState<{ url: string; state: "ready" | "failed" } | null>(null);
  const [motionPlaybackFailure, setMotionPlaybackFailure] = useState<string | null>(null);
  // Keep a stable media source during short job-status polls. Changing a signed
  // URL every five seconds restarts browser MP4 decoding, even when bytes exist.
  const signedMediaCache = useRef(new Map<string, { url: string; createdAt: number }>());

  const [imageJob, setImageJob] = useState<any>(null);
  const [motionJob, setMotionJob] = useState<any>(null);
  const [motionAssetJob, setMotionAssetJob] = useState<any>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const [motionTermsAccepted, setMotionTermsAccepted] = useState(false);
  const scene = scenes[selectedIndex] ?? null;
  const selectedSceneId = useRef<string | undefined>(scene?.id);
  selectedSceneId.current = scene?.id;
  const busy = generating || motionGenerating || assemblyRunning || assetLoading;
  const externalLegacyRenderHref = assemblyJob?.status === "completed" && finalVideo?.downloadable !== true
    ? legacyRenderHref(finalVideo?.video_url) : null;
  const hostedLegacyRenderHref = externalLegacyRenderHref
    ? hostedShotstackRenderHref(externalLegacyRenderHref) : null;
  const finalPreviewUrl = hostedLegacyRenderHref || finalVideo?.video_url || null;
  const sceneSeconds = scene ? Math.max(0, Number(scene.end_time) - Number(scene.start_time)) : 0;
  const savedProof = motionAssetJob?.output?.arena_status_response?.result?.verification;
  const savedProofSeconds = Number(savedProof?.measured_duration_seconds ?? savedProof?.video_duration_seconds);
  const motionDuration = motionMeasured && motion && motionMeasured.assetId === motion.id ? motionMeasured.seconds
    : Number.isFinite(savedProofSeconds) && savedProofSeconds > 0 ? savedProofSeconds : null;
  const remainingMotionSeconds = motionDuration === null ? null : Math.max(0, sceneSeconds - motionDuration);
  const pilotDuration = pilotMeasured && freePilotUrl && pilotMeasured.url === freePilotUrl ? pilotMeasured.seconds : null;
  const pending = (job: any) => ["queued", "submitted", "processing"].includes(job?.status);
  const productionText = useMemo(() => scene ? prompt(scene) : "", [scene]);
  // Identical provider failures can affect multiple jobs. Report all affected
  // stages once per actual error without hiding the error code or job state.
  const jobFailureMap = new Map<string, string[]>();
  for (const { label, job } of [
    { label: "Scene image", job: imageJob },
    { label: "Scene motion", job: motionJob },
    { label: "Final assembly", job: assemblyJob },
  ]) {
    if (job?.status !== "failed") continue;
    const message = productionErrorMessage(job.error ?? "Generation failed.");
    const labels = jobFailureMap.get(message) ?? [];
    if (!labels.includes(label)) labels.push(label);
    jobFailureMap.set(message, labels);
  }
  const jobFailures = [...jobFailureMap].map(([message, labels]) => ({ message, labels }));

  // The saved asset's generating job is authoritative, not a newer retry.
  const isProceduralMotion = useMemo(() => {
    if (!motion) return false;
    if (motion.model === "image-motion") return true;
    const assetJob = motionAssetJob?.id === motion.generation_job_id
      ? motionAssetJob
      : motionJob?.id === motion.generation_job_id ? motionJob : null;
    const output = assetJob?.output;
    return [
      output?.arena_response?.result?.generation_type,
      output?.arena_status_response?.result?.generation_type,
      output?.result?.generation_type,
    ].includes("PROCEDURAL_MOTION");
  }, [motion, motionAssetJob, motionJob]);

  async function reuseSignedMedia(kind: "image" | "motion", id: string, sign: () => Promise<string>) {
    const key = projectId + ":" + kind + ":" + id;
    const cached = signedMediaCache.current.get(key);
    if (cached && Date.now() - cached.createdAt < SIGNED_MEDIA_REUSE_MS) return cached.url;
    const url = await sign();
    signedMediaCache.current.set(key, { url, createdAt: Date.now() });
    return url;
  }

  async function displayImage(asset: any) {
    if (!asset?.storage_path) return asset;
    const url = await reuseSignedMedia("image", asset.id, async () => {
      const result = await supabase.functions.invoke("beatvision-generation", {
        body: { action: "image_url", projectId, assetId: asset.id },
      });
      if (result.error) throw result.error;
      if (!result.data?.image_url) throw new Error("No fresh image URL was returned.");
      return String(result.data.image_url);
    });
    return { ...asset, image_url: url };
  }

  const [imageHistory, setImageHistory] = useState<any[]>([]);
  const [motionHistory, setMotionHistory] = useState<any[]>([]);
  const [imagePreviewFailure, setImagePreviewFailure] = useState<string | null>(null);
  const assetChoice = useRef<{sceneId: string; imageId?: string; motionId?: string}>({sceneId: ''});
  const attemptId = useRef<string | null>(null);
  const rows = (data: any) => Array.isArray(data) ? data : data ? [data] : [];

  const refreshScene = useCallback(async (sceneId: string) => {
    const [images, motions, imageJobs, motionJobs] = await Promise.all([
      supabase.from("scene_image_assets").select(imageFields).eq("project_id", projectId).eq("visual_plan_id", plan?.id).eq("scene_id", sceneId).order("created_at", { ascending: false }),
      supabase.from("motion_clip_assets").select("*").eq("project_id", projectId).eq("visual_plan_id", plan?.id).eq("scene_id", sceneId).order("created_at", { ascending: false }),
      supabase.from("generation_jobs").select("id,status,error,job_type,output,input_snapshot").eq("project_id", projectId).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_image").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("generation_jobs").select("id,status,error,job_type,output,input_snapshot").eq("project_id", projectId).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_motion").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const result of [images, motions, imageJobs, motionJobs]) if (result.error) throw result.error;
    if (selectedSceneId.current !== sceneId) return;
    if (assetChoice.current.sceneId !== sceneId) assetChoice.current = {sceneId};
    const imageRows = rows(images.data), motionRows = rows(motions.data);
    const choose = (all: any[], id?: string) => all.find(a => a.id === id) ?? all.find(a => a.approved && a.status === 'approved') ?? all.find(a => a.status !== 'rejected') ?? all[0] ?? null;
    const selectedImage = choose(imageRows, assetChoice.current.imageId);
    const selectedMotion = choose(motionRows, assetChoice.current.motionId);
    setImageHistory(imageRows); setMotionHistory(motionRows);
    let sourceJob: any = null;
    if (selectedMotion?.generation_job_id) {
      if (motionJobs.data?.id === selectedMotion.generation_job_id) {
        sourceJob = motionJobs.data;
      } else {
        const relatedJob = await supabase.from("generation_jobs")
          .select("id,status,error,job_type,output,input_snapshot")
          .eq("project_id", projectId)
          .eq("visual_plan_scene_id", sceneId)
          .eq("job_type", "scene_motion")
          .eq("id", selectedMotion.generation_job_id)
          .maybeSingle();
        if (relatedJob.error) throw relatedJob.error;
        sourceJob = relatedJob.data;
      }
    }
    if (selectedSceneId.current !== sceneId) return;
    let freshMotion = selectedMotion;
    if (freshMotion?.provider === "huggingface-zerogpu" || freshMotion?.provider === "modal") {
      const url = await reuseSignedMedia("motion", freshMotion.id, async () => {
        const signed = await supabase.functions.invoke("beatvision-generation", { body: { action: "motion_url", projectId, assetId: freshMotion.id } });
        if (signed.error || !signed.data?.video_url) throw signed.error || new Error("Motion playback URL unavailable.");
        return String(signed.data.video_url);
      });
      freshMotion = { ...freshMotion, video_url: url };
    }
    if (selectedSceneId.current !== sceneId) return;
    setMotion(freshMotion); setImageJob(imageJobs.data); setMotionJob(motionJobs.data);
    setMotionAssetJob(sourceJob);
    // Asset eligibility comes from the owner-scoped database row, not from the
    // short-lived URL used only to render its preview. Keep the approved asset
    // selected when signing is temporarily unavailable so the server can still
    // perform its authoritative motion preflight.
    if (selectedSceneId.current === sceneId) {
      setImage(selectedImage);
      setImagePreviewFailure(null);
    }
    try {
      const freshImage = await displayImage(selectedImage);
      if (selectedSceneId.current === sceneId) setImage(freshImage);
    } catch (reason) {
      if (selectedSceneId.current === sceneId && selectedImage) {
        setImage({ ...selectedImage, image_url: "" });
        setImagePreviewFailure(productionErrorMessage(reason));
      }
    }
  }, [projectId, plan?.id]);

  const refreshFinal = useCallback(async (planId: string) => {
    const result = await supabase.from("generation_jobs").select("id,status,output,error").eq("project_id", projectId).eq("visual_plan_id", planId).eq("job_type", "assembly").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    setAssemblyJob(result.data);
    // Show only the final output belonging to this locked plan's completed job.
    setFinalVideo(result.data?.status === "completed" ? result.data.output?.final_video ?? null : null);
  }, [projectId]);

  // Project/plan-wide authoritative eligibility, not latest attempt or selected
  // asset. More than one approved clip per scene must fail closed.
  const refreshAssemblyReadiness = useCallback(async (planId: string) => {
    let status = { ready: false, message: "Unable to verify approved motion. Assembly remains unavailable." };
    try {
      const [sceneResult, motionResult] = await Promise.all([
        supabase.from("visual_plan_scenes").select("id,status").eq("project_id", projectId).eq("visual_plan_id", planId),
        supabase.from("motion_clip_assets").select("id,scene_id,status,approved,video_url").eq("project_id", projectId).eq("visual_plan_id", planId).eq("status", "approved").eq("approved", true),
      ]);
      if (sceneResult.error) throw sceneResult.error;
      if (motionResult.error) throw motionResult.error;
      const allScenes = sceneResult.data ?? [];
      const approved = motionResult.data ?? [];
      if (!allScenes.length) {
        status = { ready: false, message: "No approved scenes are available for final assembly." };
      } else if (allScenes.some(row => row.status !== "approved")) {
        status = { ready: false, message: "Approve every scene before final assembly." };
      } else {
        const counts = new Map<string, number>();
        for (const clip of approved) {
          if (clip.status === "approved" && clip.approved === true && clip.video_url)
            counts.set(clip.scene_id, (counts.get(clip.scene_id) ?? 0) + 1);
        }
        const remaining = allScenes.filter(row => counts.get(row.id) !== 1).length;
        status = remaining
          ? { ready: false, message: String(remaining) + " of " + String(allScenes.length) + " scenes still need exactly one approved real motion clip." }
          : { ready: approved.length === allScenes.length, message: "All scene motion is approved. Final assembly is available." };
        if (!remaining && approved.length !== allScenes.length)
          status = { ready: false, message: "Motion approval records are inconsistent. Final assembly is unavailable." };
      }
    } catch (reason) {
      status = { ready: false, message: "Could not check approved motion: " + productionErrorMessage(reason) };
    }
    setAssemblyReadiness(status);
    return status;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setPlan(null); setScenes([]); setSelectedIndex(0);
    setAssemblyReadiness({ ready: false, message: "Checking approved motion clips…" });
    (async () => {
      try {
        const requestedPlan = new URLSearchParams(window.location.search).get('plan');
        let query = supabase.from("visual_plans").select(planFields).eq("project_id", projectId).eq("status", "approved");
        if (requestedPlan) query = query.eq("id", requestedPlan);
        const result = await query.order("revision_number", {ascending:false}).limit(1).single();
        if (result.error) throw new Error("Lock the Visual Plan before entering Production.");
        const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields).eq("visual_plan_id", result.data.id).eq("status", "approved").order("scene_number", { ascending: true });
        if (sceneResult.error) throw sceneResult.error;
        if (!active) return;
        setPlan(result.data as VisualPlan); setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
        await Promise.all([refreshFinal(result.data.id), refreshAssemblyReadiness(result.data.id)]);
      } catch (e) { if (active) setError(productionErrorMessage(e)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [projectId, refreshFinal, refreshAssemblyReadiness]);

  useEffect(() => {
    let active = true;
    setImage(null); setMotion(null); setImageJob(null); setMotionJob(null); setMotionAssetJob(null); setImagePreviewFailure(null); setError(null);
    if (!scene) return;
    setAssetLoading(true);
    refreshScene(scene.id).catch(e => { if (active) setError(productionErrorMessage(e)); }).finally(() => { if (active) setAssetLoading(false); });
    return () => { active = false; };
  }, [scene?.id, refreshScene]);

  useEffect(() => {
    if (!scene || !plan) return;
    // Jobs can finish in the scheduler even when the initial browser request fails.
    const interval = pending(imageJob) || pending(motionJob) || pending(assemblyJob) ? 5000 : 50 * 60 * 1000;
    let active = true;
    const timer = window.setInterval(() => {
      Promise.all([refreshScene(scene.id), refreshFinal(plan.id)]).catch(e => { if (active) setError(productionErrorMessage(e)); });
    }, interval);
    return () => { active = false; window.clearInterval(timer); };
  }, [scene?.id, plan?.id, imageJob?.status, motionJob?.status, assemblyJob?.status, refreshScene, refreshFinal]);

  async function operateJob(type: "scene_image" | "scene_motion" | "assembly", existing?: any) {
    if (!scene || !plan) return;
    const sceneId = scene.id;
    const setBusy = type === "scene_image" ? setGenerating : type === "scene_motion" ? setMotionGenerating : setAssemblyRunning;
    const setJob = type === "scene_image" ? setImageJob : type === "scene_motion" ? setMotionJob : setAssemblyJob;
    setBusy(true); setError(null);
    try {
      let job = existing;
      if (!job && type === "assembly") {
        const check = await refreshAssemblyReadiness(plan.id);
        if (!check.ready) throw new Error(check.message);
      }
      if (!job) {
        if (type === "scene_motion" && !motionTermsAccepted) throw new Error("Accept the LTX model use restrictions before AI motion.");
        if (type === "scene_motion" && motionProvider === "modal") {
          // A preview UI can temporarily be newer than the deployed Edge controller.
          // Fail closed: old controllers ignore provider and would silently use HF.
          const probe = await supabase.functions.invoke("beatvision-generation", {
            body: { action: "modal_capability", projectId },
          });
          if (probe.error || probe.data?.modal_supported !== true || probe.data?.modal_available !== true)
            throw new Error("Modal GPU is not connected to this Studio deployment. No generation was submitted.");
        }
        attemptId.current ??= crypto.randomUUID();
        const queued = type === "assembly"
          ? await supabase.rpc("enqueue_assembly_generation", { p_project_id: projectId, p_visual_plan_id: plan.id })
          : type === "scene_motion"
            ? await supabase.functions.invoke("beatvision-generation", { body: { action: "enqueue_ai_motion", projectId, sceneId, sourceImageId: image?.id, requestId: attemptId.current, acceptedTerms: motionTermsAccepted, provider: motionProvider } })
            : await supabase.rpc("enqueue_scene_image_variant", { p_project_id: projectId, p_scene_id: sceneId, p_request_id: attemptId.current });
        if (queued.error) throw queued.error;
        job = type === "scene_motion" ? queued.data?.job : queued.data;
        if (type === "scene_motion" && motionProvider === "modal" &&
            (!job?.input_snapshot?.modal_motion || job?.provider === "huggingface-zerogpu"))
          throw new Error("MODAL_PROVIDER_MISMATCH: No motion job was submitted.");
      }
      if (!job?.id) throw new Error("No generation job was returned.");
      setJob(job);
      attemptId.current = null;
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: job.id, action: ["submitted", "processing"].includes(job.status) ? "poll" : "run" } });
      if (run.error) throw run.error;
      const result = run.data?.job;
      if (!result?.id) throw new Error("Generation controller returned no job state.");
      // Fetch persisted assets, then retain the authoritative response if a replica
      // has not observed the latest job write yet.
      if (type === "assembly") await refreshFinal(plan.id); else await refreshScene(sceneId);
      setJob(result);
      // Persisted failure state owns the alert; request errors remain global.
      // Do not duplicate a job-level provider alert for this same failure.
      if (type === "assembly" && result.status === "completed") setFinalVideo(result.output?.final_video ?? null);
    } catch (e) { setError(productionErrorMessage(e)); }
    finally { setBusy(false); }
  }

  const generateImage = () => operateJob("scene_image");
  const generateMotion = () => operateJob("scene_motion");
  useEffect(() => {
    setFreePilotUrl(null);
    setPilotMeasured(null);
    setMotionMeasured(null);
    setFreePilotJob(null);
    setFreePilotError(null);
    setFreePilotStatusMessage(null);
  }, [projectId, scene?.id]);

  async function generateFreePilot() {
    if (!wanPreviewEligibilityVerified || !scene || image?.status !== "approved" || busy || freePilotBusy || freePilotJob) return;
    const targetScene = scene.id;
    setFreePilotBusy(true);
    setFreePilotUrl(null);
    setPilotMeasured(null);
    setFreePilotError(null);
    setFreePilotStatusMessage("Submitting one free AI video request...");
    try {
      const result = await supabase.functions.invoke("beatvision-free-motion-pilot", {
        body: { action: "start", project_id: projectId, scene_id: targetScene },
      });
      if (result.error) throw new Error(await motionPilotErrorMessage(result.error));
      const data = result.data;
      if (!data?.ok || data?.status !== "submitted" || !data?.job_token)
        throw new Error(String(data?.error || "Free ZeroGPU job was not accepted."));
      if (selectedSceneId.current === targetScene) {
        setFreePilotJob({ token: String(data.job_token), sceneId: targetScene });
        setFreePilotStatusMessage("Job accepted. Checking Hugging Face status without resubmitting.");
      }
    } catch (reason) {
      if (selectedSceneId.current === targetScene) {
        setFreePilotError(productionErrorMessage(reason));
        setFreePilotStatusMessage("Submission failed; no preview was queued.");
      }
    } finally {
      setFreePilotBusy(false);
    }
  }

  async function checkFreePilotStatus(job: { token: string; sceneId: string }): Promise<"processing" | "done" | "terminal" | "retry" | "in_flight"> {
    if (selectedSceneId.current !== job.sceneId) return "terminal";
    // A manual tap while the 7s background poll is active must never issue a
    // second concurrent status request or restart generation.
    if (freePilotPollingRef.current) return "in_flight";
    freePilotPollingRef.current = true;
    setFreePilotChecking(true);
    setFreePilotStatusMessage("Checking the existing Hugging Face job...");
    try {
      const result = await supabase.functions.invoke("beatvision-free-motion-pilot", {
        body: { action: "poll", project_id: projectId, scene_id: job.sceneId, job_token: job.token },
      });
      if (result.error) throw new Error(await motionPilotErrorMessage(result.error));
      const data = result.data;
      if (data?.ok && data?.status === "processing") {
        if (selectedSceneId.current === job.sceneId) {
          setFreePilotError(null);
          setFreePilotStatusMessage("Still generating or waiting for free GPU capacity. No new request sent.");
        }
        return "processing";
      }
      if (data?.ok && data?.status === "failed" && data?.terminal === true) {
        if (selectedSceneId.current === job.sceneId) {
          setFreePilotJob(null);
          setFreePilotUrl(null);
          setFreePilotStatusMessage("This provider job has finished with a failure; automatic polling stopped.");
          setFreePilotError(String(data?.error || "The free Hugging Face model failed to render this preview.").slice(0,300));
        }
        return "terminal";
      }
      const media = String(data?.video_url || "");
      const trusted = /^https:\/\/zerogpu-aoti-wan2-2-fp8da-aoti-faster\.hf\.space\//.test(media);
      if (!data?.ok || data?.status !== "pilot_ready" || data?.generation_type !== "GENERATIVE_VIDEO" || !trusted)
        throw new Error(String(data?.error || "Free provider has not returned verified AI video."));
      if (selectedSceneId.current === job.sceneId) {
        setFreePilotUrl(media);
        setFreePilotJob(null);
        setFreePilotError(null);
        setFreePilotStatusMessage("Hugging Face returned a video preview. It is not approved or saved.");
      }
      return "done";
    } catch (reason) {
      if (selectedSceneId.current === job.sceneId) {
        setFreePilotError(productionErrorMessage(reason));
        setFreePilotStatusMessage("Status check failed. Use Check Preview Status to retry the same job.");
      }
      return "retry";
    } finally {
      freePilotPollingRef.current = false;
      setFreePilotChecking(false);
    }
  }

  useEffect(() => {
    if (!freePilotJob || freePilotJob.sceneId !== scene?.id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const status = await checkFreePilotStatus(freePilotJob);
      if (active && status === "processing") timer = window.setTimeout(() => void poll(), 7000);
    };
    timer = window.setTimeout(() => void poll(), 5000);
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [freePilotJob?.token, scene?.id, projectId]);

  const checkMotionStatus = () => operateJob("scene_motion", motionJob);
  const assembleFinal = () => operateJob("assembly");
  const checkAssemblyStatus = () => operateJob("assembly", assemblyJob);

  async function downloadFinalVideo() {
    if (!finalVideo?.video_url || finalVideo.downloadable !== true ||
        finalPlayback?.url !== finalVideo.video_url || finalPlayback?.state !== "ready" ||
        assemblyJob?.status !== "completed" || downloading) return;
    setDownloading(true); setError(null);
    try {
      const response = await fetch(finalVideo.video_url);
      if (!response.ok) throw new Error("Video download failed (HTTP " + response.status + ").");
      const blob = await response.blob();
      if (!blob.size || !blob.type.toLowerCase().startsWith("video/")) {
        throw new Error("Video download failed: the server returned no valid video media.");
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "BeatVision-" + projectId + ".mp4";
      document.body.appendChild(link);
      try { link.click(); }
      finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) { setError(productionErrorMessage(e)); }
    finally { setDownloading(false); }
  }

  async function rejectAsset(type: string, id: string) {
    if (!scene) return;
    setError(null);
    const result = await supabase.rpc('reject_scene_asset', {p_asset_type: type, p_asset_id: id});
    if (result.error) { setError(productionErrorMessage(result.error)); return; }
    if (type === 'scene_image') assetChoice.current.imageId = undefined; else assetChoice.current.motionId = undefined;
    await refreshScene(scene.id).catch(e => setError(productionErrorMessage(e)));
  }

  async function approveMotion() {
    if (!motion || motion.status !== "generated" || !motion.video_url) return;
    setError(null);
    const result = await supabase.rpc("approve_motion_clip_asset", { p_asset_id: motion.id });
    if (result.error) setError(productionErrorMessage(result.error));
    else {
      setMotion(result.data);
      if (plan) await refreshAssemblyReadiness(plan.id);
    }
  }

  async function approveImage() {
    if (!image || image.status !== "generated" || !image.image_url) return;
    setError(null);
    const result = await supabase.rpc("approve_scene_image_asset", { p_asset_id: image.id });
    if (result.error) setError(productionErrorMessage(result.error)); else setImage({ ...result.data, image_url: image.image_url });
  }

  async function copyBrief() {
    if (!productionText) return;
    await navigator.clipboard.writeText(productionText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (loading) return <div className="app-shell"><StudioHeader projectId={projectId} activeStage="production" /><main className="dashboard production-page"><div className="style-loading">Loading Production Workspace…</div></main></div>;

  if (!plan || !scene) {
    return (
      <div className="app-shell">
      <StudioHeader projectId={projectId} activeStage="production" />
      <main className="dashboard production-page">
        <header className="style-header"><div><span className="eyebrow">06 / PRODUCTION</span><h1>Production Workspace</h1></div></header>
        <section className="style-empty-panel"><p className="form-error" role="alert">{error ?? "No approved production scenes found."}</p><a className="secondary-button" href={`/projects/${projectId}/scenes`}>Return to Production Brief</a></section>
      </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
    <StudioHeader projectId={projectId} projectTitle={plan.title} planId={plan.id} activeStage="production" />
    <main className="dashboard production-page" style={{ maxWidth: "1400px" }}>
      <header className="style-header">
        <div>
          <span className="eyebrow">06 / PRODUCTION WORKSPACE</span>
          <h1>Shot Monitor &amp; Video Assembly</h1>
          <p>Build the shots from the locked direction. {plan.title} is approved. Select a scene and review its production brief.</p>
        </div>
        <div className="style-status">PLAN LOCKED / {scenes.length} SCENES</div>
      </header>

      {error && !jobFailureMap.has(error) && <p className="form-error" role="alert">{error}</p>}
      {(pending(imageJob) || pending(motionJob) || pending(assemblyJob)) && <p role="status">Generation is still processing. Status refreshes automatically; no completed media is claimed yet.</p>}
      {jobFailures.map(({ message, labels }) => <p className="form-error" role="alert" key={message}>{labels.join(" / ")}: {message}</p>)}
      <div className="production-nav">
        <a className="secondary-button" href={`/projects/${projectId}/visual-plan?plan=${plan.id}`}>← Visual Plan</a>
        <a className="secondary-button" href={`/projects/${projectId}/scenes?plan=${plan.id}`}>Production Briefs</a>
      </div>

      <section className="production-layout">
        <aside className="production-scene-list">
          <span className="panel-label">SCENES</span>
          {scenes.map((item, index) => (
            <button disabled={busy} key={item.id} className={index === selectedIndex ? "production-scene selected" : "production-scene"} onClick={() => setSelectedIndex(index)}>
              <span>SCENE {String(item.scene_number).padStart(2, "0")}</span>
              <strong>{readableSceneTitle(item)}</strong>
              <small>{time(item.start_time)} — {time(item.end_time)}</small>
            </button>
          ))}
        </aside>

        <section className="production-detail">
          <div className="production-detail-head">
            <div><span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span><h2>{readableSceneTitle(scene)}</h2><p>{time(scene.start_time)} — {time(scene.end_time)} · {formatCreativeText(scene.location)}</p></div>
            <span className="style-lock-badge">APPROVED</span>
          </div>

          <div className="production-grid">
            <article><span>Visual</span><p>{formatCreativeText(scene.visual_direction)}</p></article>
            <article><span>Camera</span><p>{formatCreativeText(scene.camera_direction)}</p></article>
            <article><span>Movement</span><p>{formatCreativeText(scene.movement_direction)}</p></article>
            <article><span>Mood</span><p>{formatCreativeText(scene.mood)}</p></article>
            <article><span>Transition</span><p>{formatCreativeText(scene.transition_style)}</p></article>
            <article><span>Continuity</span><p>{formatCreativeText(scene.continuity_notes)}</p></article>
            <article className="production-wide"><span>Lyric / musical moment</span><p>{formatCreativeText(scene.lyric_moment) || "Follow the analyzed musical section."}</p></article>
          </div>

          <div className="production-actions">
            <button className="primary-button" onClick={() => void copyBrief()}>{copied ? "Copied" : "Copy Shot Brief"}</button>
            <button className="secondary-button" disabled={busy || selectedIndex === 0} onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))}>Previous Scene</button>
            <button className="secondary-button" disabled={busy || selectedIndex === scenes.length - 1} onClick={() => setSelectedIndex((value) => Math.min(scenes.length - 1, value + 1))}>Next Scene</button>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">SCENE IMAGE</span>
            {imageHistory.length > 1 && <label>Saved image variants<select aria-label="Saved image variants" value={image?.id ?? ''} onChange={event => { assetChoice.current.imageId = event.target.value; void refreshScene(scene.id).catch(e => setError(productionErrorMessage(e))); }}>{imageHistory.map((asset, index) => <option key={asset.id} value={asset.id}>Variant {imageHistory.length - index} · {asset.status}</option>)}</select></label>}
            {image?.image_url ? <img src={image.image_url} alt={scene.title} style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 12 }} />
              : image ? <p role="alert">The approved scene image is preserved, but its preview is temporarily unavailable{imagePreviewFailure ? ": " + imagePreviewFailure : "."}</p>
              : <p>No real scene image exists yet. Generation is only enabled from the approved Scene Direction.</p>}
            <div className="production-actions">
              <button className="primary-button" disabled={busy || pending(imageJob)} onClick={() => void generateImage()}>{generating ? "Generating…" : image ? "Generate Another Variant" : "Generate Scene Image"}</button>
              {pending(imageJob) && <button className="secondary-button" disabled={busy} onClick={() => void operateJob("scene_image", imageJob)}>Check Image Status</button>}
              {image?.status === "generated" && <button className="secondary-button" onClick={() => void approveImage()}>Approve Image</button>}
              {image?.status === "generated" && <button className="secondary-button" disabled={busy} onClick={() => void rejectAsset("scene_image", image.id)}>Reject Image</button>}
              {image?.status === "approved" && <span className="style-lock-badge">IMAGE APPROVED</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">MOTION</span>
            <label>Motion generator
              <select aria-label="Motion generator" value={motionProvider}
                disabled={busy || pending(motionJob)}
                onChange={event => { setMotionProvider(event.target.value as "huggingface" | "modal"); attemptId.current = null; }}>
                <option value="huggingface">Hugging Face (existing)</option>
                <option value="modal">Modal LTX 0.9.5 (account-gated)</option>
              </select>
            </label>
            {motionHistory.length > 1 && <label>Saved motion variants<select aria-label="Saved motion variants" value={motion?.id ?? ''} onChange={event => { assetChoice.current.motionId = event.target.value; void refreshScene(scene.id).catch(e => setError(productionErrorMessage(e))); }}>{motionHistory.map((asset, index) => <option key={asset.id} value={asset.id}>Variant {motionHistory.length - index} · {asset.status}</option>)}</select></label>}
            {motion?.provider === "huggingface-zerogpu" && <p>Saved AI-generated motion · LTX 0.9.8 distilled. Two seconds requested; actual media duration is measured below. Singing lip sync is not verified.</p>}
            {motion && <p>{isProceduralMotion ? "Procedural image animation (pan/zoom), not AI-generated subject motion." : `Provider: ${motion.provider} · Model: ${motion.model}`}</p>}
            {motion?.video_url ? <video key={motion.id} src={motion.video_url} controls playsInline
  onLoadedMetadata={event => { const seconds = event.currentTarget.duration;
    if (Number.isFinite(seconds) && seconds > 0) {
      setMotionMeasured({ assetId: motion.id, seconds });
      setMotionPlaybackFailure(null);
    }
  }}
  onError={() => {
    signedMediaCache.current.delete(projectId + ":motion:" + motion.id);
    setMotionMeasured(null);
    setMotionPlaybackFailure(motion.id);
  }} style={{ width: "100%", maxHeight: 520, borderRadius: 12 }} /> : <p>No real motion clip exists yet. Motion requires an approved real scene image.</p>}
            {motion?.id === motionPlaybackFailure && <p role="alert">This approved motion clip could not be played. Its status does not prove browser playback. <button className="secondary-button" onClick={() => { if (scene) void refreshScene(scene.id).catch(e => setError(productionErrorMessage(e))); }}>Retry Motion Playback</button></p>}
            {motion && <p role="status">
              {motionAssetJob?.input_snapshot?.hf_motion?.duration_seconds
                ? "LTX requested " + Number(motionAssetJob.input_snapshot.hf_motion.duration_seconds).toFixed(2) + "s. " : ""}
              {motionDuration === null ? "Actual media duration not loaded yet."
                : "Decoded clip " + motionDuration.toFixed(2) + "s of scene " + sceneSeconds.toFixed(2) + "s."}
              {remainingMotionSeconds !== null && remainingMotionSeconds > 0.05
                ? " Remaining uncovered scene time: " + remainingMotionSeconds.toFixed(2) + "s. Additional approved AI clips required." : ""}
            </p>}
            <div className="production-actions">
              {!pending(motionJob) && <label><input type="checkbox" checked={motionTermsAccepted} onChange={event => setMotionTermsAccepted(event.target.checked)} /> I agree to the <a href="https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt" target="_blank" rel="noreferrer">LTX model license and use restrictions</a>, including AI disclosure.</label>}
              {!pending(motionJob) && <p>{motionProvider === "modal"
                ? "Modal GPU is an opt-in 2-second LTX preview. It starts only if server credentials and the account budget gate are enabled. Existing approved clips are preserved."
                : "Generate a 2-second AI motion preview. Existing approved clips remain saved; this preview is not full-scene coverage."}</p>}
              {!pending(motionJob) && <button className="primary-button" disabled={busy || image?.status !== "approved" || !motionTermsAccepted} onClick={() => void generateMotion()}>{motionGenerating ? "Starting Motion…" : "Generate Motion"}</button>}
              {pending(motionJob) && <button className="secondary-button" disabled={busy} onClick={() => void checkMotionStatus()}>{motionGenerating ? "Checking…" : "Check Motion Status"}</button>}
              {motion?.status === "generated" && <button className="secondary-button" onClick={() => void approveMotion()}>Approve Motion</button>}
              {motion?.status === "generated" && <button className="secondary-button" disabled={busy} onClick={() => void rejectAsset("scene_motion", motion.id)}>Reject Motion</button>}
              {motion?.status === "approved" && <span className="style-lock-badge">MOTION APPROVED</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">FREE AI MOVEMENT PREVIEW</span>
            <p>New Wan previews are unavailable while account eligibility and model permissions are unverified. Generate Motion uses the verified LTX controller. Existing Wan tickets can still be checked.</p>
            <div className="production-actions">
              <button className="secondary-button" disabled={!wanPreviewEligibilityVerified || busy || freePilotBusy || Boolean(freePilotJob) || image?.status !== "approved"} onClick={() => void generateFreePilot()}>
                {freePilotBusy ? "Submitting free GPU preview…" : freePilotJob ? "Preview queued (no resubmission)" : "Wan AI preview unavailable"}
              </button>
              {freePilotJob && <button className="secondary-button" disabled={freePilotBusy || freePilotChecking} onClick={() => void checkFreePilotStatus(freePilotJob)}>
                {freePilotChecking ? "Checking Preview Status..." : "Check Preview Status"}
              </button>}
            </div>
            {freePilotStatusMessage && <p role="status">{freePilotStatusMessage}</p>}
            {freePilotJob && <p>Only the existing job is polled; no new generation is submitted.</p>}
            {freePilotError && <p className="form-error" role="alert">{freePilotError}</p>}
            {freePilotUrl && (
              <div>
                <video key={freePilotUrl} src={freePilotUrl} controls playsInline
                  onLoadedMetadata={event => {
                    const seconds = event.currentTarget.duration;
                    if (Number.isFinite(seconds) && seconds > 0) setPilotMeasured({ url: freePilotUrl, seconds });
                  }} style={{ width: "100%", maxHeight: 520, borderRadius: 12 }} />
                <p role="status">Temporary Wan 2.2 preview · {pilotDuration === null
                  ? "Loading actual duration." : "Decoded preview duration: " + pilotDuration.toFixed(2) + "s."}</p>
                <p>AI-generated subject movement preview only. The result has not been approved and does not cover the full scene.</p>
                <a className="secondary-button" href={freePilotUrl} target="_blank" rel="noopener noreferrer">Open free AI motion preview</a>
              </div>
            )}
          </div>

          <div className="production-provider-note">
            <span className="panel-label">FINAL ASSEMBLY</span>
            {assemblyJob && <p role="status">
              Assembly status: {assemblyJob.status}.
              {" "}Provider stage: {assemblyJob.output?.arena_status_response?.result?.status ?? assemblyJob.output?.arena_response?.result?.status ?? "Not reported"}.
              {" "}Last checked: {assemblyJob.output?.last_polled_at ?? "Not checked yet"}.
            </p>}
            {finalPreviewUrl ? <video key={finalPreviewUrl} src={finalPreviewUrl} controls playsInline
              onCanPlay={() => setFinalPlayback({ url: finalPreviewUrl, state: "ready" })}
              onError={() => setFinalPlayback({ url: finalPreviewUrl, state: "failed" })}
              style={{ width: "100%", maxHeight: 600, borderRadius: 12 }} /> : <p>No completed final video exists yet. Assembly requires every approved scene to have an approved real motion clip.</p>}
            {!finalVideo && <p role="status">{assemblyReadiness.message}</p>}
            {finalVideo?.video_url && finalPlayback?.url === finalPreviewUrl && finalPlayback?.state === "failed" && <p role="alert">The saved final-video URL could not be played on this device. A completed job does not establish that the file is still accessible.</p>}
            {finalVideo?.video_url && finalVideo.downloadable !== true && <p role="status">A final render is recorded, but its database record is marked non-downloadable. Do not assume the external render URL is a durable export.</p>}
            {hostedLegacyRenderHref && <p role="status">The original Shotstack render link was temporary. This player checks the provider-hosted copy without generating new media. <a href={hostedLegacyRenderHref} target="_blank" rel="noopener noreferrer">Open hosted render (availability unverified)</a>. A hosted copy is not yet an independently archived export.</p>}
            <div className="production-actions">
              {!finalVideo && !pending(assemblyJob) && <button className="primary-button" disabled={busy || !assemblyReadiness.ready} onClick={() => void assembleFinal()}>{assemblyRunning ? "Starting Assembly…" : "Assemble Final Video"}</button>}
              {pending(assemblyJob) && <button className="secondary-button" disabled={busy} onClick={() => void checkAssemblyStatus()}>{assemblyRunning ? "Checking…" : "Check Assembly Status"}</button>}
              {finalVideo?.video_url && finalVideo.downloadable === true && finalPlayback?.url === finalPreviewUrl && finalPlayback?.state === "ready" && <button className="secondary-button" disabled={downloading} onClick={() => void downloadFinalVideo()}>{downloading ? "Downloading…" : "Download Video"}</button>}
              {finalVideo?.video_url && <span className="style-lock-badge">{finalPlayback?.url === finalPreviewUrl && finalPlayback?.state === "ready" ? "FINAL PREVIEW READY" : "RENDER RECORDED · PLAYBACK UNVERIFIED"}</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">GENERATION</span>
            <h3>Provider generation is authenticated and database-authoritative.</h3>
            <p>Scene images, motion clips, and final assembly are accepted only when real provider media is persisted against the locked project lineage. Missing provider output remains a failure.</p>
          </div>
        </section>
      </section>
    </main>
    </div>
  );
}
