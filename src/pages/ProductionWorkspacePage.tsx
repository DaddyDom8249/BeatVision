import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";
const imageFields = "id,project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved,created_at,updated_at";

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

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const planResult = await supabase.from("visual_plans").select(planFields)
        .eq("project_id", projectId).eq("status", "approved").single();
      if (planResult.error) {
        if (active) { setError("Lock the Visual Plan before entering Production."); setLoading(false); }
        return;
      }
      const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields)
        .eq("visual_plan_id", planResult.data.id).eq("status", "approved")
        .order("scene_number", { ascending: true });
      if (sceneResult.error) {
        if (active) { setError(sceneResult.error.message); setLoading(false); }
        return;
      }
      if (active) {
        setPlan(planResult.data as VisualPlan);
        setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
        const finalResult = await supabase.from("final_videos").select("id,project_id,title,video_url,preview_video_url,audio_file,duration,format,quality,render_status,downloadable,segment_count,created_at,updated_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (finalResult.error) { if (active) setError(finalResult.error.message); } else if (active) setFinalVideo(finalResult.data ?? null);
        const assemblyResult = await supabase.from("generation_jobs").select("id,project_id,visual_plan_id,job_type,status,output,error,created_at,updated_at").eq("project_id", projectId).eq("visual_plan_id", planResult.data.id).eq("job_type", "assembly").order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (assemblyResult.error) { if (active) setError(assemblyResult.error.message); } else if (active) setAssemblyJob(assemblyResult.data ?? null);
        const firstScene = (sceneResult.data ?? [])[0];
        if (firstScene) {
          const imageResult = await supabase.from("scene_image_assets").select(imageFields).eq("scene_id", firstScene.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (imageResult.error) { if (active) setError(imageResult.error.message); }
          else if (active) setImage(imageResult.data ?? null);
        }
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  const scene = scenes[selectedIndex] ?? null;

  useEffect(() => {
    let active = true;
    if (!scene) { setImage(null); setMotion(null); return () => { active = false; }; }
    (async () => {
      const result = await supabase.from("scene_image_assets").select(imageFields).eq("scene_id", scene.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      if (result.error) setError(result.error.message); else setImage(result.data ?? null);
      const motionResult = await supabase.from("motion_clip_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").eq("scene_id", scene.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      if (motionResult.error) setError(motionResult.error.message); else setMotion(motionResult.data ?? null);
    })();
    return () => { active = false; };
  }, [scene?.id]);
  const productionText = useMemo(() => scene ? prompt(scene) : "", [scene]);

  async function generateImage() {
    if (!scene || !plan || plan.status !== "approved") return;
    setGenerating(true); setError(null);
    try {
      const queued = await supabase.rpc("enqueue_scene_generation", { p_project_id: projectId, p_scene_id: scene.id, p_job_type: "scene_image" });
      if (queued.error) throw queued.error;
      const job = queued.data as { id: string };
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: job.id, action: "run" } });
      if (run.error) throw run.error;
      const latest = await supabase.from("scene_image_assets").select(imageFields).eq("generation_job_id", job.id).maybeSingle();
      if (latest.error) throw latest.error;
      if (!latest.data) throw new Error("Generation completed without a persisted real image asset.");
      setImage(latest.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setGenerating(false); }
  }

  async function generateMotion() {
    if (!scene || !plan || plan.status !== "approved" || !image || image.status !== "approved") return;
    setMotionGenerating(true); setError(null);
    try {
      const queued = await supabase.rpc("enqueue_scene_generation", { p_project_id: projectId, p_scene_id: scene.id, p_job_type: "scene_motion" });
      if (queued.error) throw queued.error;
      const job = queued.data as { id: string };
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: job.id, action: "run" } });
      if (run.error) throw run.error;
      const result = run.data?.job;
      const asset = await supabase.from("motion_clip_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").eq("generation_job_id", job.id).maybeSingle();
      if (asset.error) throw asset.error;
      if (asset.data) setMotion(asset.data);
      else if (result?.status === "processing") setError("Motion is processing in Arena. No completed clip exists yet; use Check Motion Status when the provider finishes.");
      else throw new Error("Motion generation completed without a persisted real video asset.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMotionGenerating(false); }
  }

  async function checkMotionStatus() {
    if (!motion?.generation_job_id) return;
    setMotionGenerating(true); setError(null);
    try {
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: motion.generation_job_id, action: "poll" } });
      if (run.error) throw run.error;
      const asset = await supabase.from("motion_clip_assets").select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").eq("generation_job_id", motion.generation_job_id).maybeSingle();
      if (asset.error) throw asset.error;
      if (asset.data) setMotion(asset.data);
      else if (run.data?.job?.status === "failed") throw new Error(run.data?.job?.error?.message || "Motion generation failed.");
      else setError("Motion is still processing. No completed clip exists yet.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setMotionGenerating(false); }
  }

  async function assembleFinal() {
    if (!plan || scenes.length === 0 || !scenes.every((item) => item.status === "approved")) return;
    setAssemblyRunning(true); setError(null);
    try {
      const queued = await supabase.rpc("enqueue_assembly_generation", { p_project_id: projectId, p_visual_plan_id: plan.id });
      if (queued.error) throw queued.error;
      const job = queued.data as any;
      setAssemblyJob(job);
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: job.id, action: "run" } });
      if (run.error) throw run.error;
      const result = run.data?.job;
      if (result?.status === "completed" && result?.output?.final_video) setFinalVideo(result.output.final_video);
      else if (result?.status === "processing") setError("Final assembly is processing in Shotstack. No completed final video exists yet; use Check Assembly Status.");
      else if (result?.status === "failed") throw new Error(result?.error?.message || "Final assembly failed.");
      else setAssemblyJob(result);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAssemblyRunning(false); }
  }

  async function checkAssemblyStatus() {
    if (!assemblyJob?.id) return;
    setAssemblyRunning(true); setError(null);
    try {
      const run = await supabase.functions.invoke("beatvision-generation", { body: { projectId, jobId: assemblyJob.id, action: "poll" } });
      if (run.error) throw run.error;
      const result = run.data?.job;
      setAssemblyJob(result);
      if (result?.status === "completed" && result?.output?.final_video) setFinalVideo(result.output.final_video);
      else if (result?.status === "failed") throw new Error(result?.error?.message || "Final assembly failed.");
      else setError("Final assembly is still processing. No completed final video exists yet.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setAssemblyRunning(false); }
  }

  async function approveMotion() {
    if (!motion || motion.status !== "generated" || !motion.video_url) return;
    const result = await supabase.from("motion_clip_assets").update({ status: "approved", approved: true }).eq("id", motion.id).eq("status", "generated").select("id,project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved,created_at,updated_at").single();
    if (result.error) setError(result.error.message); else setMotion(result.data);
  }

  async function approveImage() {
    if (!image || image.status !== "generated") return;
    const result = await supabase.from("scene_image_assets").update({ status: "approved", approved: true }).eq("id", image.id).eq("status", "generated").select(imageFields).single();
    if (result.error) setError(result.error.message); else setImage(result.data);
  }

  async function copyBrief() {
    if (!productionText) return;
    await navigator.clipboard.writeText(productionText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  if (loading) return <main className="studio-main production-page"><div className="style-loading">Loading Production Workspace…</div></main>;

  if (error || !plan || !scene) {
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

      <div className="production-nav">
        <a className="secondary-button" href={`/projects/${projectId}/visual-plan`}>← Visual Plan</a>
        <a className="secondary-button" href={`/projects/${projectId}/scenes`}>Production Briefs</a>
      </div>

      <section className="production-layout">
        <aside className="production-scene-list">
          <span className="panel-label">SCENES</span>
          {scenes.map((item, index) => (
            <button key={item.id} className={index === selectedIndex ? "production-scene selected" : "production-scene"} onClick={() => setSelectedIndex(index)}>
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
            <button className="secondary-button" disabled={selectedIndex === 0} onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))}>Previous Scene</button>
            <button className="secondary-button" disabled={selectedIndex === scenes.length - 1} onClick={() => setSelectedIndex((value) => Math.min(scenes.length - 1, value + 1))}>Next Scene</button>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">SCENE IMAGE</span>
            {image?.image_url ? <img src={image.image_url} alt={scene.title} style={{ width: "100%", maxHeight: 520, objectFit: "contain", borderRadius: 12 }} /> : <p>No real scene image exists yet. Generation is only enabled from the approved Scene Direction.</p>}
            <div className="production-actions">
              <button className="primary-button" disabled={generating || Boolean(image)} onClick={() => void generateImage()}>{generating ? "Generating…" : image ? "Image Generated" : "Generate Scene Image"}</button>
              {image?.status === "generated" && <button className="secondary-button" onClick={() => void approveImage()}>Approve Image</button>}
              {image?.status === "approved" && <span className="style-lock-badge">IMAGE APPROVED</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">MOTION</span>
            {motion?.video_url ? <video src={motion.video_url} controls playsInline style={{ width: "100%", maxHeight: 520, borderRadius: 12 }} /> : <p>No real motion clip exists yet. Motion requires an approved real scene image.</p>}
            <div className="production-actions">
              {!motion && <button className="primary-button" disabled={motionGenerating || image?.status !== "approved"} onClick={() => void generateMotion()}>{motionGenerating ? "Starting Motion…" : "Generate Motion"}</button>}
              {motion?.status === "processing" && <button className="secondary-button" disabled={motionGenerating} onClick={() => void checkMotionStatus()}>{motionGenerating ? "Checking…" : "Check Motion Status"}</button>}
              {motion?.status === "generated" && <button className="secondary-button" onClick={() => void approveMotion()}>Approve Motion</button>}
              {motion?.status === "approved" && <span className="style-lock-badge">MOTION APPROVED</span>}
            </div>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">FINAL ASSEMBLY</span>
            {finalVideo?.video_url ? <video src={finalVideo.video_url} controls playsInline style={{ width: "100%", maxHeight: 600, borderRadius: 12 }} /> : <p>No completed final video exists yet. Assembly requires every approved scene to have an approved real motion clip.</p>}
            <div className="production-actions">
              {!finalVideo && !assemblyJob && <button className="primary-button" disabled={assemblyRunning} onClick={() => void assembleFinal()}>{assemblyRunning ? "Starting Assembly…" : "Assemble Final Video"}</button>}
              {assemblyJob?.status === "processing" && <button className="secondary-button" disabled={assemblyRunning} onClick={() => void checkAssemblyStatus()}>{assemblyRunning ? "Checking…" : "Check Assembly Status"}</button>}
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