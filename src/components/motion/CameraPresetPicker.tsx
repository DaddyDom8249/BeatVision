import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase/client";
import { CAMERA_PRESETS, CAMERA_PRESET_IDS, computeSceneTiming, isCameraPresetId, presetToDirective, type CameraPresetId, type TimingAnalysis } from "../../lib/beatvision/motion/cameraPresets";
import type { VisualPlanScene } from "../../types/visualPlan";

const SOURCE_LABEL = { bpm_grid: "Estimated from BPM", sections: "Section timing", scene_bounds: "Scene bounds only" } as const;

// Per-scene camera-move preset for the Motion stage. The selection is stored in
// scene_camera_presets; the generation controller reads it when it builds the
// motion job. Generating motion still goes through the existing job path.
export default function CameraPresetPicker({ projectId, scene, songId, locked }: { projectId: string; scene: VisualPlanScene; songId: string; locked: boolean }) {
  const [analysis, setAnalysis] = useState<TimingAnalysis | null>(null);
  const [preset, setPreset] = useState<CameraPresetId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null); setPreset(null);
    (async () => {
      const [song, row] = await Promise.all([
        supabase.from("songs").select("analysis").eq("id", songId).maybeSingle(),
        supabase.from("scene_camera_presets").select("preset").eq("project_id", projectId).eq("scene_id", scene.id).maybeSingle(),
      ]);
      if (!active) return;
      if (song.error) setError("Could not load song analysis: " + song.error.message);
      else setAnalysis((song.data?.analysis ?? null) as TimingAnalysis | null);
      if (row.error) setError("Camera presets are unavailable: " + row.error.message);
      else setPreset(isCameraPresetId(row.data?.preset) ? row.data.preset : null);
    })();
    return () => { active = false; };
  }, [projectId, scene.id, songId]);

  const preview = useMemo(() => {
    if (!preset || !analysis) return null;
    try { return presetToDirective(preset, computeSceneTiming(scene, analysis)); }
    catch (e) { return e instanceof Error ? e.message : "Timing unavailable."; }
  }, [preset, analysis, scene]);

  async function choose(value: string) {
    if (!isCameraPresetId(value) || locked) return;
    setSaving(true); setError(null);
    const result = await supabase.from("scene_camera_presets").upsert({ scene_id: scene.id, project_id: projectId, preset: value }, { onConflict: "scene_id" }).select("preset").single();
    if (result.error) setError("Could not save camera preset: " + result.error.message);
    else setPreset(result.data.preset as CameraPresetId);
    setSaving(false);
  }

  return (
    <div className="camera-preset-picker">
      <label>
        <span className="panel-label">CAMERA MOVE</span>
        <select value={preset ?? ""} disabled={locked || saving} onChange={(e) => void choose(e.target.value)}>
          <option value="" disabled>Use scene camera direction</option>
          {CAMERA_PRESET_IDS.map((id) => <option key={id} value={id}>{CAMERA_PRESETS[id].label}</option>)}
        </select>
      </label>
      {locked && <small>Camera move is fixed once a motion job exists for this scene.</small>}
      {typeof preview === "string" && <p className="form-error" role="alert">{preview}</p>}
      {preview && typeof preview !== "string" && (
        <p><strong>{SOURCE_LABEL[preview.timing_source]}:</strong> {preview.timing_note} {preview.prompt_directive}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
