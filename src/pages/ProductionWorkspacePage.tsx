import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase/client";
import { getCreativeErrorMessage } from "../lib/formatCreativeText";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";
const imageFields = "id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved,created_at,updated_at";

function productionErrorMessage(error: unknown) {
  const message = typeof error === "string" ? error : getCreativeErrorMessage(error, "Production request failed.");
  if (message.includes("ASSEMBLY_MOTION_NOT_FULLY_APPROVED")) {
    return "Approve a real motion clip for every scene before assembling the final video.";
  }
  return message;
}

function time(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

function prompt(scene: VisualPlanScene) {
  return [
    "SCENE " + scene.scene_number + ": " + scene.title,
    "TIME: " + time(scene.start_time) + "–" + time(scene.end_time),
    "LOCATION: " + scene.location,
    "MOOD: " + scene.mood,
    "VISUAL: " + scene.visual_direction,
    "CAMERA: " + scene.camera_direction,
    "MOVEMENT: " + scene.movement_direction,
    "MUSICAL / LYRIC MOMENT: " + (scene.lyric_moment || "Follow the analyzed musical section."),
    "TRANSITION: " + scene.transition_style,
    "CONTINUITY: " + scene.continuity_notes,
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
  const [motionGenerating, setMotionGenerating] = useState(false);
  const [finalVideo, setFinalVideo] = useState<any>(null);
  const [assemblyJob, setAssemblyJob] = useState<any>(null);
  const [assemblyRunning, setAssemblyRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [imageJob, setImageJob] = useState<any>(null);
  const [motionJob, setMotionJob] = useState<any>(null);
  const [assetLoading, setAssetLoading] = useState(false);
  const scene = scenes[selectedIndex] ?? null;
  const selectedSceneId = useRef<string | undefined>(scene?.id);
  selectedSceneId.current = scene?.id;
  const busy = generating || motionGenerating || assemblyRunning || assetLoading;
  const pending = (job: any) => ["queued", "submitted", "processing"].includes(job?.status);
  const productionText = useMemo(() => scene ? prompt(scene) : "", [scene]);

  async function displayImage(asset: any) {
    if (!asset?.storage_path) return asset;
    const result = await supabase.functions.invoke("beatvision-generation", {
      body: { action: "image_url", projectId, assetId: asset.id },
    });
    if (result.error) throw result.error;
    if (!result.data?.image_url) throw new Error("No fresh image URL was returned.");
    return { ...asset, image_url: result.data.image_url };
  }

  const refreshScene = useCallback(async (sceneId: string) => {
    const [images, motions, imageJobs, motionJobs] = await Promise.all([
      supabase.from("scene_image_assets").select(imageFields).eq("scene_id", sceneId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("motion_clip_assets").select("*").eq("scene_id", sceneId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("generation_jobs").select("id,status,error,job_type,output").eq("project_id", projectId).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_image").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("generation_jobs").select("id,status,error,job_type,output").eq("project_id", projectId).eq("visual_plan_scene_id", sceneId).eq("job_type", "scene_motion").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    for (const result of [images, motions, imageJobs, motionJobs]) if (result.error) throw result.error;
    if (selectedSceneId.current !== sceneId) return;
    setMotion(motions.data); setImageJob(imageJobs.data); setMotionJob(motionJobs.data);
    const freshImage = await displayImage(images.data);
    if (selectedSceneId.current === sceneId) setImage(freshImage);
  }, [projectId]);

  const refreshFinal = useCallback(async (planId: string) => {
    const result = await supabase.from("generation_jobs").select("id,status,output,error").eq("project_id", projectId).eq("visual_plan_id", planId).eq("job_type", "assembly").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    setAssemblyJob(result.data);
    // Show only the final output belonging to this locked plan's completed job.
    setFinalVideo(result.data?.status === "completed" ? result.data.output?.final_video ?? null : null);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setPlan(null); setScenes([]); setSelectedIndex(0);
    (async () => {
      try {
        const result = await supabase.from("visual_plans").select(planFields).eq("project_id", projectId).eq("status", "approved").single();
        if (result.error) throw new Error("Lock the Visual Plan before entering Production.");
        const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields).eq("visual_plan_id", result.data.id).eq("status", "approved").order("scene_number", { ascending: true });
        if (sceneResult.error) throw sceneResult.error;
        if (!active) return;
        setPlan(result.data as VisualPlan); setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
        await refreshFinal(result.data.id);
      } catch (e) { if (active) setError(productionErrorMessage(e)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [projectId, refreshFinal]);

  useEffect(() => {
    let active = true;
    setImage(null); setMotion(null); setImageJob(null); setMotionJob(null); setError(null);
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
      if (!job) {
        const queued = type === "assembly"
          ? await supabase.rpc("enqueue_assembly_generation", { p_project_id: projectId, p_visual_plan_id: plan.id })
          : await supabase.rpc("enqueue_scene_generation", { p_project_id: projectId, p_scene_id: sceneId, p_job_type: type });
        if (queued.error) throw queued.error;
        job = queued.data;
      }
      if (!job?.id) throw new Error("No generation job was returned.");
      setJob(job);
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: job.id, action: ["submitted", "processing"].includes(job.status) ? "poll" : "run" } });
      if (run.error) throw run.error;
      const result = run.data?.job;
      if (!result?.id) throw new Error("Generation controller returned no job state.");
      // Fetch persisted assets, then retain the authoritative response if a replica
      // has not observed the latest job write yet.
      if (type === "assembly") await refreshFinal(plan.id); else await refreshScene(sceneId);
      setJob(result);
      if (result.status === "failed") throw new Error(result.error?.message || "Generation failed.");
      if (type === "assembly" && result.status === "completed") setFinalVideo(result.output?.final_video ?? null);
    } catch (e) { setError(productionErrorMessage(e)); }
    finally { setBusy(false); }
  }

  const generateImage = () => operateJob("scene_image");
  const generateMotion = () => operateJob("scene_motion");
  const checkMotionStatus = () => operateJob("scene_motion", motionJob);
  const assembleFinal = () => operateJob("assembly");
  const checkAssemblyStatus = () => operateJob("assembly", assemblyJob);

  async function downloadFinalVideo() {
    if (!finalVideo?.video_url || assemblyJob?.status !== "completed" || downloading) return;
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

  async function approveMotion() {
    if (!motion || motion.status !== "generated" || !motion.video_url) return;
    setError(null);
    const result = await supabase.rpc("approve_motion_clip_asset", { p_asset_id: motion.id });
    if (result.error) setError(productionErrorMessage(result.error)); else setMotion(result.data);
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

  if (loading) return <main className="studio-main production-page"><div className="style-loading">Loading Production Workspace…</div></main>;

  if (!plan || !scene) {
    return (
      <main className="studio-main production-page">
        <header className="style-header"><div><span className="eyebrow">PHASE 5 / PRODUCTION</span><h1>Production Workspace</h1></div></header>
        <section className="style-empty-panel"><p className="form-error" role="alert">{error ?? "No approved production scenes found."}</p><a className="secondary-button" href={`/projects/${projectId}/scenes`}>Return to Production Brief</a></section>
      </main>
    );
  }

  return (
    <main className="studio-main production-page">
      <header className="style-header">
        <div>
          <span className="eyebrow">PHASE 5 / PRODUCTION WORKSPACE</span>
          <h1>Build the shots from the locked direction.</h1>
          <p>{plan.title} is approved. Select a scene, review its production brief, and carry the locked creative direction into your production tools.</p>
        </div>
        <div className="style-status">PLAN LOCKED / {scenes.length} SCENES</div>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {(pending(imageJob) || pending(motionJob) || pending(assemblyJob)) && <p role="status">Generation is still processing. Status refreshes automatically; no completed media is claimed yet.</p>}
      {[imageJob, motionJob, assemblyJob].filter(job => job?.status === "failed").map(job => <p className="form-error" role="alert" key={job.id}>{job.error?.message || "Generation failed."}</p>)}
      <div className="production-nav">
        <a className="secondary-button" href={`/projects/${projectId}/visual-plan`}>← Visual Plan</a>
        <a className="secondary-button" href={`/projects/${projectId}/scenes`}>Production Briefs</a>
      </div>

      <section className="production-layout">
        <aside className="production-scene-list">
          <span className="panel-label">SCENES</span>
          {scenes.map((item, index) => (
            <button disabled={busy} key={item.id} className={index === selectedIndex ? "production-scene selected" : "production-scene"} onClick={() => setSelectedIndex(index)}>
              <span>SCENE {String(item.scene_number).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
              <small>{time(item.start_time)} — {time(item.end_time)}</small>
            </button>
          ))}
        </aside>

        <section className="production-detail">
          <div className="production-detail-head">
            <div><span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span><h2>{scene.title}</h2><p>{time(scene.start_time)} — {time(scene.end_time)} · {scene.location}</p></div>
            <span className="style-lock-badge">APPROVED</span>
          </div>

          <div className="production-grid">
            <article><span>Visual</span><p>{scene.visual_direction}</p></article>
            <article><span>Camera</span><p>{scene.camera_direction}</p></article>
            <article><span>Movement</span><p>{scene.movement_direction}</p></article>
            <article><span>Mood</span><p>{scene.mood}</p></article>
            <article><span>Transition</span><p>{scene.transition_style}</p></article>
            <article><span>Continuity</span><p>{scene.continuity_notes}</p></article>
            <article className="production-wide"><span>Lyric / musical moment</span><p>{scene.lyric_moment || "Follow the analyzed musical section."}</p></article>
          </div>

          <div className="production-actions">
            <button className="primary-button" onClick={() => void copyBrief()}>{copied ? "Copied" : "Copy Shot Brief"}</button>
            <button className="secondary-button" disabled={busy || selectedIndex === 0} onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))}>Previous Scene</button>
            <button className="secondary-button" disabled={busy || selectedIndex === scenes.length - 1} onClick={() => setSelectedIndex((value) => Math.min(scenes.length - 1, value + 1))}>Next Scene</button>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">SCENE IMAGE</span>
            {image?.image_url ? <img src={image.image_url} alt={scene.title} style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 12 }} /> : <p>No real scene image exists yet. Generation is only enabled from the approved Scene Direction.</p>}
            <div className="production-actions">
              <button className="primary-button" disabled={busy || pending(imageJob) || Boolean(image)} onClick={() => void generateImage()}>{generating ? "Generating…" : image ? "Image Generated" : "Generate Scene Image"}</button>
              {pending(imageJob) && <button className="secondary-button" disabled={busy} onClick={() => void operateJob("scene_image", imageJob)}>Check Image Status</button>}
              {image?.status === "generated" && <button className="secondary-button" onClick={() => void approveImage()}>Approve Image</button>}
              {image?.status === "approved" && <span className="style-lock-badge">IMAGE APPROVED</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">MOTION</span>
            {motion && <p>{motion.model === "image-motion" || (motionJob?.id === motion.generation_job_id && motionJob?.output?.arena_response?.result?.generation_type === "PROCEDURAL_MOTION") ? "Procedural image animation (pan/zoom), not AI-generated subject motion." : `Provider: ${motion.provider} · Model: ${motion.model}`}</p>}
            {motion?.video_url ? <video src={motion.video_url} controls playsInline style={{ width: "100%", maxHeight: 520, borderRadius: 12 }} /> : <p>No real motion clip exists yet. Motion requires an approved real scene image.</p>}
            <div className="production-actions">
              {!motion && !pending(motionJob) && <button className="primary-button" disabled={busy || image?.status !== "approved"} onClick={() => void generateMotion()}>{motionGenerating ? "Starting Motion…" : "Generate Motion"}</button>}
              {pending(motionJob) && <button className="secondary-button" disabled={busy} onClick={() => void checkMotionStatus()}>{motionGenerating ? "Checking…" : "Check Motion Status"}</button>}
              {motion?.status === "generated" && <button className="secondary-button" onClick={() => void approveMotion()}>Approve Motion</button>}
              {motion?.status === "approved" && <span className="style-lock-badge">MOTION APPROVED</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">FINAL ASSEMBLY</span>
            {assemblyJob && <p role="status">
              Assembly status: {assemblyJob.status}.
              {" "}Provider stage: {assemblyJob.output?.arena_status_response?.result?.status ?? assemblyJob.output?.arena_response?.result?.status ?? "Not reported"}.
              {" "}Last checked: {assemblyJob.output?.last_polled_at ?? "Not checked yet"}.
            </p>}
            {finalVideo?.video_url ? <video src={finalVideo.video_url} controls playsInline style={{ width: "100%", maxHeight: 600, borderRadius: 12 }} /> : <p>No completed final video exists yet. Assembly requires every approved scene to have an approved real motion clip.</p>}
            <div className="production-actions">
              {!finalVideo && !pending(assemblyJob) && <button className="primary-button" disabled={busy} onClick={() => void assembleFinal()}>{assemblyRunning ? "Starting Assembly…" : "Assemble Final Video"}</button>}
              {pending(assemblyJob) && <button className="secondary-button" disabled={busy} onClick={() => void checkAssemblyStatus()}>{assemblyRunning ? "Checking…" : "Check Assembly Status"}</button>}
              {finalVideo?.video_url && <button className="secondary-button" disabled={downloading} onClick={() => void downloadFinalVideo()}>{downloading ? "Downloading…" : "Download Video"}</button>}
              {finalVideo?.video_url && <span className="style-lock-badge">FINAL VIDEO COMPLETE</span>}
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
  );
}
