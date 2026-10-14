import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import PipelineCanvas from "../components/canvas/PipelineCanvas";
import { buildPipelineGraph, type CanvasInput, type PipelineGraph } from "../lib/beatvision/pipelineCanvas";

// Read-only: this page only SELECTs from existing tables. It never writes.
export async function loadCanvasInput(projectId: string): Promise<CanvasInput> {
  const planResult = await supabase.from("visual_plans").select("id,song_id,style_bible_id,status,updated_at")
    .eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (planResult.error) throw planResult.error;
  const plan = planResult.data as { id: string; song_id: string | null; style_bible_id: string | null } | null;

  const songQuery = supabase.from("songs").select("id,analysis").eq("project_id", projectId);
  const styleQuery = supabase.from("style_bibles").select("id,status,reference_assets,updated_at").eq("project_id", projectId);
  const [song, style, finalVideo] = await Promise.all([
    (plan?.song_id ? songQuery.eq("id", plan.song_id) : songQuery).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    (plan?.style_bible_id ? styleQuery.eq("id", plan.style_bible_id) : styleQuery).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("final_videos").select("id,video_url,render_status,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [song, style, finalVideo]) if (r.error) throw r.error;
  const styleBible = style.data as { id: string; status: string; reference_assets: unknown } | null;

  const empty = Promise.resolve({ data: [], error: null });
  const [scenes, characters, environments, images, clips] = await Promise.all([
    plan ? supabase.from("visual_plan_scenes").select("id,scene_number,section_index,start_time,end_time,title,status,location,visual_direction,continuity_notes").eq("visual_plan_id", plan.id).order("scene_number", { ascending: true }) : empty,
    styleBible ? supabase.from("characters").select("id,name,status").eq("project_id", projectId).eq("style_bible_id", styleBible.id) : empty,
    styleBible ? supabase.from("environments").select("id,name,status").eq("project_id", projectId).eq("style_bible_id", styleBible.id) : empty,
    plan ? supabase.from("scene_image_assets").select("id,scene_id,status,approved").eq("project_id", projectId).eq("visual_plan_id", plan.id) : empty,
    plan ? supabase.from("motion_clip_assets").select("id,scene_id,status,approved").eq("project_id", projectId).eq("visual_plan_id", plan.id) : empty,
  ]);
  for (const r of [scenes, characters, environments, images, clips]) if (r.error) throw r.error;

  const analysis = (song.data as { analysis?: { sections?: CanvasInput["sections"] } } | null)?.analysis;
  const refs = Array.isArray(styleBible?.reference_assets) ? styleBible!.reference_assets as CanvasInput["references"] : [];
  return {
    sections: Array.isArray(analysis?.sections) ? analysis!.sections! : [],
    scenes: (scenes.data ?? []) as CanvasInput["scenes"],
    characters: (characters.data ?? []) as CanvasInput["characters"],
    environments: (environments.data ?? []) as CanvasInput["environments"],
    references: refs,
    referencesApproved: styleBible?.status === "approved",
    sceneImages: (images.data ?? []) as CanvasInput["sceneImages"],
    motionClips: (clips.data ?? []) as CanvasInput["motionClips"],
    finalVideo: (finalVideo.data ?? null) as CanvasInput["finalVideo"],
  };
}

export default function PipelineCanvasPage({ projectId }: { projectId: string }) {
  const [graph, setGraph] = useState<PipelineGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setGraph(null); setError(null);
    loadCanvasInput(projectId)
      .then((input) => { if (active) setGraph(buildPipelineGraph(input)); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not load the pipeline."); });
    return () => { active = false; };
  }, [projectId]);
  return (
    <main className="studio-main">
      <header className="style-header">
        <div>
          <span className="eyebrow">PIPELINE CANVAS</span>
          <h1>The whole video, at a glance.</h1>
          <p>Song sections flow into scenes, and scenes into their assets. Read-only.</p>
        </div>
        <a className="secondary-button" href={`/projects/${projectId}/production`}>Production Workspace</a>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!error && !graph && <p>Loading pipeline…</p>}
      {graph && <PipelineCanvas graph={graph} />}
    </main>
  );
}
