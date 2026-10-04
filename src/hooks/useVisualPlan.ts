import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";
import type { StyleBible } from "../types/style";
import type { VisionLock, VisualPlan, VisualPlanScene } from "../types/visualPlan";
import type { WorldReport } from "../types/world";
import type { Song, SongAnalysis } from "../types/song";

const planFields = "id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,title,duration_seconds,creative_thesis,global_direction,locked_at,created_at,updated_at";
const visionLockFields = "id,project_id,world_report_id,style_bible_id,song_id,revision_number,status,snapshot,locked_at,created_at";
const styleFields = "id,project_id,world_report_id,status,world_basis,visual_language,cinematography,color_lighting,atmosphere,movement,continuity_rules,visual_rules,reference_assets,approved_at,created_at,updated_at";
const sceneFields = "id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes,status,created_at,updated_at";

function firstText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string").join(", ");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).filter((v): v is string => typeof v === "string").join(", ");
  return "";
}

function sectionWindows(analysis: SongAnalysis, duration: number) {
  const sections = Array.isArray(analysis.sections) && analysis.sections.length
    ? analysis.sections.map((section) => ({ section_index: section.index, start_time: Math.max(0, Number(section.start_time)), end_time: Math.min(duration, Number(section.end_time)) }))
      .filter((section) => Number.isFinite(section.start_time) && Number.isFinite(section.end_time) && section.end_time > section.start_time)
    : [];
  if (sections.length) return sections;

  const regions = Array.isArray(analysis.energy_region_candidates)
    ? analysis.energy_region_candidates.map((region, index) => ({ section_index: index, start_time: Math.max(0, Number(region.start_time)), end_time: Math.min(duration, Number(region.end_time)) }))
      .filter((region) => Number.isFinite(region.start_time) && Number.isFinite(region.end_time) && region.end_time > region.start_time)
    : [];
  return regions.length ? regions : [{ section_index: 0, start_time: 0, end_time: duration }];
}

export function useVisualPlan(projectId: string) {
  const [world, setWorld] = useState<WorldReport | null>(null);
  const [styleBible, setStyleBible] = useState<StyleBible | null>(null);
  const [song, setSong] = useState<Song | null>(null);
  const [visionLock, setVisionLock] = useState<VisionLock | null>(null);
  const [plan, setPlan] = useState<VisualPlan | null>(null);
  const [scenes, setScenes] = useState<VisualPlanScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);

    const projectResult = await supabase.from("projects").select("world_report_id").eq("id", projectId).single();
    if (projectResult.error) { setError(projectResult.error.message); setLoading(false); return; }

    const worldId = projectResult.data.world_report_id as string | null;
    if (!worldId) {
      setWorld(null); setStyleBible(null); setSong(null); setVisionLock(null); setPlan(null); setScenes([]);
      setError("The project must have a current World Report before Visual Plan can begin.");
      setLoading(false); return;
    }

    const [worldResult, styleResult, songResult, lockResult, planResult] = await Promise.all([
      supabase.from("world_reports").select("*").eq("id", worldId).eq("project_id", projectId).single(),
      supabase.from("style_bibles").select(styleFields).eq("project_id", projectId).eq("world_report_id", worldId).maybeSingle(),
      supabase.from("songs").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("vision_locks").select(visionLockFields).eq("project_id", projectId).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("visual_plans").select(planFields).eq("project_id", projectId).maybeSingle(),
    ]);

    const firstError = worldResult.error ?? styleResult.error ?? songResult.error ?? lockResult.error ?? planResult.error;
    if (firstError) { setError(firstError.message); setLoading(false); return; }

    setWorld(worldResult.data as WorldReport);
    setStyleBible((styleResult.data ?? null) as StyleBible | null);
    setSong((songResult.data ?? null) as Song | null);
    setVisionLock((lockResult.data ?? null) as VisionLock | null);
    setPlan((planResult.data ?? null) as VisualPlan | null);

    if (planResult.data) {
      const sceneResult = await supabase.from("visual_plan_scenes").select(sceneFields).eq("visual_plan_id", planResult.data.id).order("scene_number", { ascending: true });
      if (sceneResult.error) { setError(sceneResult.error.message); setLoading(false); return; }
      setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
    } else setScenes([]);

    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const createVisionLock = useCallback(async () => {
    if (!world?.id || world.status !== "completed" || !world.confirmed_at) throw new Error("Confirm the Visual World Report before creating the Vision Lock.");
    if (!styleBible || styleBible.status !== "approved" || !styleBible.approved_at) throw new Error("Approve the Style Bible before creating the Vision Lock.");
    if (!song || song.analysis_status !== "completed" || !song.analysis) throw new Error("Complete song analysis before creating the Vision Lock.");
    if (visionLock) return visionLock;

    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc("create_vision_lock", { p_project_id: projectId });
      if (result.error) throw result.error;
      const created = result.data as VisionLock;
      setVisionLock(created);
      return created;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to create Vision Lock.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [projectId, world, styleBible, song, visionLock]);

  const createPlan = useCallback(async () => {
    if (!world?.id || world.status !== "completed" || !world.confirmed_at) throw new Error("The Visual World Report must be confirmed before creating a Visual Plan.");
    if (!styleBible || styleBible.status !== "approved" || !styleBible.approved_at) throw new Error("The Style Bible must be locked before creating a Visual Plan.");
    if (!song || song.analysis_status !== "completed" || !song.analysis) throw new Error("The song analysis must be completed before creating a Visual Plan.");
    if (!visionLock) throw new Error("Create the immutable Vision Lock before building Scene Direction.");

    setWorking(true); setError(null);
    try {
      const duration = Number(song.analysis.duration_seconds);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Song analysis does not contain a valid duration.");
      const windows = sectionWindows(song.analysis, duration);
      const globalDirection = {
        visual_language: world.visual_language ?? styleBible.visual_language,
        cinematography: styleBible.cinematography ?? world.cinematography,
        color_lighting: styleBible.color_lighting ?? world.color_lighting,
        atmosphere: styleBible.atmosphere ?? world.atmosphere,
        movement: styleBible.movement ?? world.movement,
        continuity_rules: styleBible.continuity_rules ?? world.continuity_rules,
      };

      const defaultLocation = firstText(world.environments) || firstText(world.atmosphere) || "World-defined environment";
      const defaultMood = firstText(world.mood) || "World-defined emotional state";
      const defaultCamera = firstText(styleBible.cinematography) || firstText(world.cinematography) || "Follow the locked cinematography rules.";
      const defaultMovement = firstText(styleBible.movement) || firstText(world.movement) || "Follow the locked movement language.";
      const defaultContinuity = firstText(styleBible.continuity_rules) || firstText(world.continuity_rules) || "Preserve all locked World and Style continuity.";

      const rows = windows.map((window, index) => ({
        scene_number: index + 1,
        section_index: window.section_index,
        start_time: window.start_time,
        end_time: window.end_time,
        title: `Section ${index + 1}`,
        visual_direction: "Translate this musical section into the confirmed World without introducing a new visual language.",
        camera_direction: defaultCamera,
        movement_direction: defaultMovement,
        location: defaultLocation,
        mood: defaultMood,
        lyric_moment: "",
        transition_style: index === 0 ? "Opening transition" : "Match the musical transition.",
        continuity_notes: defaultContinuity,
      }));

      // Creation is a single database transaction. This also repairs the
      // known stranded draft-plan state (plan exists, zero scenes) instead
      // of creating another duplicate or relying on client-side cleanup.
      const result = await supabase.rpc("create_visual_plan", {
        p_project_id: projectId,
        p_vision_lock_id: visionLock.id,
        p_duration_seconds: duration,
        p_creative_thesis: firstText(world.emotional_arc) || firstText(world.mood),
        p_global_direction: globalDirection,
        p_scenes: rows,
      });
      if (result.error) throw result.error;

      const planResult = await supabase
        .from("visual_plans")
        .select(planFields)
        .eq("id", (result.data as VisualPlan).id)
        .single();
      if (planResult.error) throw planResult.error;

      const sceneResult = await supabase
        .from("visual_plan_scenes")
        .select(sceneFields)
        .eq("visual_plan_id", (result.data as VisualPlan).id)
        .order("scene_number", { ascending: true });
      if (sceneResult.error) throw sceneResult.error;

      setPlan(planResult.data as VisualPlan);
      setScenes((sceneResult.data ?? []) as VisualPlanScene[]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to create Visual Plan.";
      setError(message);
      throw e;
    } finally { setWorking(false); }
  }, [projectId, world, styleBible, song, visionLock]);

  const saveScene = useCallback(async (sceneId: string, changes: Partial<Pick<VisualPlanScene, "title" | "visual_direction" | "camera_direction" | "movement_direction" | "location" | "mood" | "lyric_moment" | "transition_style" | "continuity_notes">>) => {
    if (!plan || plan.status !== "draft") throw new Error("The Visual Plan is locked.");
    setWorking(true); setError(null);
    try {
      const result = await supabase.from("visual_plan_scenes").update(changes).eq("id", sceneId).eq("visual_plan_id", plan.id).eq("status", "draft").select(sceneFields).single();
      if (result.error) throw result.error;
      setScenes((current) => current.map((scene) => scene.id === sceneId ? result.data as VisualPlanScene : scene));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to save scene direction.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [plan]);

  const approvePlan = useCallback(async () => {
    if (!plan || scenes.length === 0) throw new Error("Create the Visual Plan and at least one scene before locking it.");
    if (!plan.vision_lock_id) throw new Error("The Visual Plan has no Vision Lock and cannot be approved.");
    if (plan.status !== "draft") return;
    setWorking(true); setError(null);
    try {
      const result = await supabase.rpc("approve_visual_plan", { p_plan_id: plan.id });
      if (result.error) throw result.error;
      setPlan(result.data as VisualPlan);
      setScenes((current) => current.map((scene) => ({ ...scene, status: "approved" })));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to lock Visual Plan.";
      setError(message); throw e;
    } finally { setWorking(false); }
  }, [plan, scenes.length]);

  return { world, styleBible, song, visionLock, plan, scenes, loading, working, error, createVisionLock, createPlan, saveScene, approvePlan, reload: load };
}
