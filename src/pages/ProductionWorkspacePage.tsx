import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";

type GenerationJob = {
  id: string;
  status: "queued" | "submitted" | "processing" | "completed" | "failed";
  output?: {
    arena_response?: {
      result?: {
        images?: Array<{ image_url?: string | null }>;
        image_url?: string | null;
      };
    };
  } | null;
  error?: { message?: string } | null;
};

function generatedImageUrl(job: GenerationJob | null) {
  return job?.output?.arena_response?.result?.images?.[0]?.image_url
    ?? job?.output?.arena_response?.result?.image_url
    ?? null;
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
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

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
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  const scene = scenes[selectedIndex] ?? null;
  const productionText = useMemo(() => scene ? prompt(scene) : "", [scene]);

  useEffect(() => {
    if (!scene) {
      setJob(null);
      return;
    }

    let active = true;
    setGenerationError(null);

    (async () => {
      const result = await supabase
        .from("generation_jobs")
        .select("id,status,output,error")
        .eq("project_id", projectId)
        .eq("visual_plan_scene_id", scene.id)
        .eq("job_type", "scene_image")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active) {
        if (result.error) setGenerationError(result.error.message);
        setJob((result.data ?? null) as GenerationJob | null);
      }
    })();

    return () => { active = false; };
  }, [projectId, scene?.id]);

  useEffect(() => {
    if (!job || !["queued", "submitted", "processing"].includes(job.status)) return;

    let active = true;
    const timer = window.setInterval(async () => {
      const result = await supabase
        .from("generation_jobs")
        .select("id,status,output,error")
        .eq("id", job.id)
        .maybeSingle();

      if (!active || result.error || !result.data) return;
      setJob(result.data as GenerationJob);

      if (["completed", "failed"].includes(result.data.status)) {
        window.clearInterval(timer);
      }
    }, 2500);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status]);

  async function generateSceneImage() {
    if (!scene || !plan || generating) return;

    setGenerating(true);
    setGenerationError(null);

    try {
      const enqueue = await supabase.rpc("enqueue_scene_generation", {
        p_project_id: projectId,
        p_scene_id: scene.id,
        p_job_type: "scene_image",
      });

      if (enqueue.error) throw new Error(enqueue.error.message);

      const queued = (Array.isArray(enqueue.data) ? enqueue.data[0] : enqueue.data) as GenerationJob | null;
      if (!queued?.id) throw new Error("Generation enqueue returned no job id.");

      setJob(queued);

      const run = await supabase.functions.invoke("beatvision-generation", {
        body: {
          action: "run",
          projectId,
          jobId: queued.id,
        },
      });

      if (run.error) throw new Error(run.error.message);
      if (run.data?.error) throw new Error(run.data.error.message || "Generation controller failed.");

      setJob(run.data?.job as GenerationJob);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Scene image generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  const imageUrl = generatedImageUrl(job);

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
            <button className="primary-button" onClick={() => void generateSceneImage()} disabled={generating || job?.status === "processing"}>
              {generating ? "Starting…" : job?.status === "processing" ? "Generating…" : "Generate Scene Image"}
            </button>
            <button className="secondary-button" disabled={selectedIndex === 0} onClick={() => setSelectedIndex((value) => Math.max(0, value - 1))}>Previous Scene</button>
            <button className="secondary-button" disabled={selectedIndex === scenes.length - 1} onClick={() => setSelectedIndex((value) => Math.min(scenes.length - 1, value + 1))}>Next Scene</button>
          </div>

          <div className="production-provider-note">
            <span className="panel-label">GENERATION JOB</span>
            <h3>{job ? job.status.toUpperCase() : "NOT STARTED"}</h3>
            <p>Generation uses the authenticated BeatVision controller and the locked Scene Direction. No client-side provider secret or alternate provider path is used.</p>
            {generationError && <p className="form-error" role="alert">{generationError}</p>}
            {job?.error?.message && <p className="form-error" role="alert">{job.error.message}</p>}
            {imageUrl && (
              <div>
                <img src={imageUrl} alt={`Generated preview for scene ${scene.scene_number}`} style={{ width: "100%", maxWidth: 900, borderRadius: 12, display: "block", marginTop: 16 }} />
                <p>Preview returned by the Arena generation job. Durable asset persistence is still governed by the production asset pipeline.</p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}