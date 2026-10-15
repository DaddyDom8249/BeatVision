import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";
import StudioHeader from "../components/navigation/StudioHeader";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";

function time(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}

function productionPrompt(scene: VisualPlanScene) {
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

export default function SceneProductionPage({ projectId }: { projectId: string }) {
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const [scenes, setScenes] = useState<VisualPlanScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const requestedPlan = new URLSearchParams(window.location.search).get('plan');
      let query = supabase.from("visual_plans").select(planFields).eq("project_id", projectId).eq("status", "approved");
      if (requestedPlan) query = query.eq("id", requestedPlan);
      const planResult = await query.order("revision_number", {ascending:false}).limit(1).single();
      if (planResult.error) {
        if (active) { setError("Lock the Visual Plan before entering Scene Production."); setLoading(false); }
        return;
      }

      const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields)
        .eq("visual_plan_id", planResult.data.id).eq("status", "approved")
        .order("scene_number", { ascending: true });
      if (sceneResult.error) { if (active) { setError(sceneResult.error.message); setLoading(false); } return; }

      if (active) {
        setPlan(planResult.data as VisualPlan);
        setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  async function copy(scene: VisualPlanScene) {
    await navigator.clipboard.writeText(productionPrompt(scene));
    setCopied(scene.id);
    window.setTimeout(() => setCopied((current) => current === scene.id ? null : current), 1500);
  }

  if (loading) return <main><p>Loading Scene Production…</p></main>;

  if (error || !plan) {
    return <main><h1>Scene Production</h1><p role="alert">{error ?? "No approved Visual Plan found."}</p><a href={"/projects/" + projectId + "/visual-plan"}>Return to Visual Plan</a></main>;
  }

  return (
    <div className="app-shell">
      <StudioHeader
        projectId={projectId}
        activeStage="scenes"
        planId={plan.id}
        statusBadge="SCENES READY"
      />

      <main className="dashboard" style={{ maxWidth: "1200px" }}>
        <header className="style-header">
          <div>
            <span className="eyebrow">05 / SCENE PRODUCTION BRIEFS</span>
            <h1>Produce from Locked Direction</h1>
            <p>{plan.title} is approved. These scene briefs inherit the confirmed World and locked Style Bible.</p>
          </div>
          <span className="status-badge status-approved">
            {scenes.length} SCENES READY
          </span>
        </header>

        <section style={{ marginBottom: "28px" }}>
          {scenes.map((scene) => (
            <article key={scene.id} className="visual-plan-scene">
              <header>
                <div>
                  <span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span>
                  <h2 style={{ fontSize: "20px", color: "#ffffff", margin: "4px 0" }}>
                    {time(scene.start_time)} — {time(scene.end_time)} · {scene.title}
                  </h2>
                </div>
                <span className="status-badge status-approved">APPROVED</span>
              </header>

              <div className="visual-plan-grid" style={{ marginTop: "16px" }}>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Location</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.location}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Mood</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.mood}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Visual Direction</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.visual_direction}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Camera</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.camera_direction}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Movement</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.movement_direction}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Transition</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.transition_style}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Continuity</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.continuity_notes}</p></div>
                <div><strong style={{ color: "var(--accent-gold)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>Lyric / Musical Moment</strong><p style={{ marginTop: "4px", fontSize: "14px" }}>{scene.lyric_moment || "Follow the analyzed section."}</p></div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <button className="secondary-button" onClick={() => void copy(scene)}>
                  {copied === scene.id ? "Brief Copied to Clipboard ✓" : "Copy Production Brief"}
                </button>
              </div>
            </article>
          ))}
        </section>

        <section className="production-handoff">
          <div>
            <span className="eyebrow">NEXT STAGE / PRODUCTION WORKSPACE</span>
            <h2>Generate Shots in Production Workspace</h2>
            <p>
              Your approved Visual Plan is the creative source. Open the Production Workspace to generate scene images, motion clips, and final video assembly.
            </p>
          </div>
          <a className="primary-button large" href={`/projects/${projectId}/production?plan=${plan.id}`}>
            Open Production Workspace →
          </a>
        </section>
      </main>
    </div>
  );
}
