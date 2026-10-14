import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import { getVisualPlanErrorMessage } from "../lib/visualPlanErrors";
import type { StyleBible } from "../types/style";
import type { VisualPlan, VisualPlanScene } from "../types/visualPlan";
import type { WorldReport } from "../types/world";
import type { Song } from "../types/song";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,revision_number,parent_plan_id,created_at,updated_at";
const styleFields = "id,project_id,world_report_id,status,world_basis,visual_language,cinematography,color_lighting,atmosphere,movement,continuity_rules,visual_rules,reference_assets,approved_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";

export function useVisualPlan(projectId: string) {
  const [world, setWorld] = useState<WorldReport | null>(null);
  const [styleBible, setStyleBible] = useState<StyleBible | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const [visionLock, setVisionLock] = useState<Record<string, unknown> | null>(null);
  const [scenes, setScenes] = useState<VisualPlanScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planHistory, setPlanHistory] = useState<VisualPlan[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);

    const projectResult = await supabase.from("projects").select("world_report_id").eq("id", projectId).single();
    if (projectResult.error) { setError(projectResult.error.message); setLoading(false); return; }

    const worldId = projectResult.data.world_report_id as string | null;
    if (!worldId) {
      setWorld(null); setStyleBible(null); setSong(null); setPlan(null); setScenes([]);
      setError("The project must have a current World Report before Visual Plan can begin.");
      setLoading(false); return;
    }

    const [worldResult, styleResult, songResult, planResult, lockResult] = await Promise.all([
      supabase.from("world_reports").select("*").eq("id", worldId).eq("project_id", projectId).single(),
      supabase.from("style_bibles").select(styleFields).eq("project_id", projectId).eq("world_report_id", worldId).maybeSingle(),
      supabase.from("songs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("visual_plans").select(planFields).eq("project_id", projectId).order("revision_number", {ascending:false}),
      supabase.from("vision_locks").select("id,project_id,world_report_id,style_bible_id,song_id,revision_number,status,snapshot,locked_at,created_at").eq("project_id", projectId).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const firstError = worldResult.error ?? styleResult.error ?? songResult.error ?? planResult.error ?? lockResult.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }

    const history = Array.isArray(planResult.data) ? planResult.data : planResult.data ? [planResult.data] : [];
    const selectedPlanId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('plan') : null;
    const selectedPlan = history.find(row => row.id === selectedPlanId) ?? history[0] ?? null;
    setPlanHistory(history as VisualPlan[]);
    setWorld(worldResult.data as WorldReport);
    setStyleBible((styleResult.data ?? null) as StyleBible | null);
    setSong((songResult.data ?? null) as Song | null);
    setPlan(selectedPlan as VisualPlan | null);
    setVisionLock((lockResult.data ?? null) as Record<string, unknown> | null);

    if (selectedPlan) {
      const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields).eq("visual_plan_id", selectedPlan.id).order("scene_number", { ascending: true });
      if (sceneResult.error) { setError(sceneResult.error.message); setLoading(false); return; }
      setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
    } else setScenes([]);

    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const createPlan = useCallback(async () => {
    if (!world?.id || world.status !== "completed" || !world.confirmed_at) throw new Error("The Visual World Report must be confirmed before creating a Visual Plan.");
    if (!styleBible || styleBible.status !== "approved" || !styleBible.approved_at) throw new Error("The Style Bible must be locked before creating a Visual Plan.");
    if (!song || song.analysis_status !== "completed" || !song.analysis) throw new Error("The song analysis must be completed before creating a Visual Plan.");
    if (plan) throw new Error("A Visual Plan already exists for this project.");
    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc('create_visual_plan', {p_project_id: projectId});
      if (result.error) throw result.error;
      await load();
    } catch (e) { setError(getVisualPlanErrorMessage(e, 'Unable to create Visual Plan.')); throw e; }
    finally { setWorking(false); }
  }, [projectId, world, styleBible, song, plan, load]);

  const revisePlan = useCallback(async () => {
    if (!plan || plan.status !== 'approved') throw new Error('Only a locked plan can be revised.');
    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc('create_visual_plan_revision', {p_plan_id: plan.id});
      if (result.error) throw result.error;
      await load();
    } catch (e) { setError(getVisualPlanErrorMessage(e, 'Unable to revise Visual Plan.')); throw e; }
    finally { setWorking(false); }
  }, [plan, load]);

  const saveScene = useCallback(async (sceneId: string, changes: Partial<Pick<VisualPlanScene, "start_time" | "end_time" | "title" | "visual_direction" | "camera_direction" | "movement_direction" | "location" | "mood" | "lyric_moment" | "transition_style" | "continuity_notes">>) => {
    if (!plan || plan.status !== "draft") throw new Error("The Visual Plan is locked.");
    setWorking(true); setError(null);
    try {
      const result = await supabase.from("visual_plan_scenes").update(changes).eq("id", sceneId).eq("visual_plan_id", plan.id).eq("status", "draft").select(sceneFields).single();
      if (result.error) throw result.error;
      setScenes((current) => current.map((scene) => scene.id === sceneId ? result.data as VisualPlanScene : scene));
    } catch (e) {
      const message = getVisualPlanErrorMessage(e, "Unable to save scene direction.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [plan]);

  const approvePlan = useCallback(async () => {
    if (!plan || scenes.length === 0) throw new Error("Create the Visual Plan and at least one scene before locking it.");
    if (plan.status !== "draft") return;
    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc("approve_visual_plan", { p_plan_id: plan.id });
      if (result.error) throw result.error;
      setPlan(result.data as VisualPlan);
      setScenes((current) => current.map((scene) => ({ ...scene, status: "approved" })));
    } catch (e) {
      const message = getVisualPlanErrorMessage(e, "Unable to lock Visual Plan.");
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [plan, scenes.length]);

  return { world, styleBible, song, visionLock, plan, planHistory, scenes, loading, working, error, createPlan, revisePlan, saveScene, approvePlan, reload: load };
}
