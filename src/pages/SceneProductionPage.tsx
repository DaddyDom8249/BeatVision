import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";

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
      const planResult = await supabase.from("visual_plans").select(planFields)
        .eq("project_id", projectId).eq("status", "approved").single();
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
    <main>
      <header>
        <span className="eyebrow">PHASE 5 / SCENE PRODUCTION</span>
        <h1>Produce from the locked direction.</h1>
        <p>{plan.title} is approved. These scene briefs inherit the confirmed World and locked Style Bible.</p>
      </header>

      <section>
        <div><span className="eyebrow">PRODUCTION STATUS</span><h2>{scenes.length} scenes ready</h2></div>
        <p>Scene direction is read-only here. Changes belong upstream in a new Visual Plan revision.</p>
      </section>

      {scenes.map((scene) => (
        <article key={scene.id} className="visual-plan-scene">
          <header>
            <div><span className="eyebrow">SCENE {String(scene.scene_number).padStart(2, "0")}</span><h2>{time(scene.start_time)} — {time(scene.end_time)} · {scene.title}</h2></div>
            <span>Approved</span>
          </header>
          <div className="visual-plan-grid">
            <div><strong>Location</strong><p>{scene.location}</p></div>
            <div><strong>Mood</strong><p>{scene.mood}</p></div>
            <div><strong>Visual</strong><p>{scene.visual_direction}</p></div>
            <div><strong>Camera</strong><p>{scene.camera_direction}</p></div>
            <div><strong>Movement</strong><p>{scene.movement_direction}</p></div>
            <div><strong>Transition</strong><p>{scene.transition_style}</p></div>
            <div><strong>Continuity</strong><p>{scene.continuity_notes}</p></div>
            <div><strong>Lyric / music</strong><p>{scene.lyric_moment || "Follow the analyzed section."}</p></div>
          </div>
          <button className="secondary-button" onClick={() => void copy(scene)}>{copied === scene.id ? "Copied" : "Copy production brief"}</button>
        </article>
      ))}

      <section>
        <h2>Production boundary</h2>
        <p>BeatVision now has a locked, lineage-safe production brief for every scene. Provider-specific image/video generation can be attached to these briefs without altering the approved creative source.</p>
      </section>
    </main>
  );
}
