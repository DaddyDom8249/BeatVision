// Camera-move presets timed to the song.
//
// KEEP IN SYNC: supabase/functions/_shared/camera-presets.ts is a byte-identical
// copy used by the generation Edge Function (enforced by
// scripts/test/camera-presets.test.mjs). Pure, dependency-free, erasable TS only.
//
// Timing honesty: BeatVision song analysis stores `bpm` (+ confidence) and
// `sections`, but NOT detected beat timestamps. So timing is either:
//   - "bpm_grid": a grid estimated from BPM, phase-anchored at 0s (NOT detected beats)
//   - "sections": analyzed section boundaries
//   - "scene_bounds": no musical timing available; the scene's own start/end
// The source and a human-readable note are always returned with the directive.

export const CAMERA_PRESET_IDS = [
  "static", "push_in", "pull_out", "pan_left", "pan_right", "tilt_up", "tilt_down", "orbit", "whip_pan",
] as const;
export type CameraPresetId = typeof CAMERA_PRESET_IDS[number];

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  move: "none" | "dolly" | "pan" | "tilt" | "orbit" | "whip";
  direction: "none" | "in" | "out" | "left" | "right" | "up" | "down" | "clockwise";
  // How the move relates to musical accents.
  accent: "hold" | "continuous" | "final_beat";
  directive: string;
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPreset> = {
  static: { id: "static", label: "Static (locked off)", move: "none", direction: "none", accent: "hold", directive: "Locked-off camera, no camera movement; let the subject carry the motion" },
  push_in: { id: "push_in", label: "Push in", move: "dolly", direction: "in", accent: "continuous", directive: "Slow steady dolly push in toward the subject" },
  pull_out: { id: "pull_out", label: "Pull out", move: "dolly", direction: "out", accent: "continuous", directive: "Slow steady dolly pull back away from the subject, revealing the surroundings" },
  pan_left: { id: "pan_left", label: "Pan left", move: "pan", direction: "left", accent: "continuous", directive: "Smooth horizontal pan to the left" },
  pan_right: { id: "pan_right", label: "Pan right", move: "pan", direction: "right", accent: "continuous", directive: "Smooth horizontal pan to the right" },
  tilt_up: { id: "tilt_up", label: "Tilt up", move: "tilt", direction: "up", accent: "continuous", directive: "Smooth vertical tilt upward" },
  tilt_down: { id: "tilt_down", label: "Tilt down", move: "tilt", direction: "down", accent: "continuous", directive: "Smooth vertical tilt downward" },
  orbit: { id: "orbit", label: "Orbit", move: "orbit", direction: "clockwise", accent: "continuous", directive: "Camera orbits clockwise around the subject at a constant distance" },
  whip_pan: { id: "whip_pan", label: "Whip pan", move: "whip", direction: "right", accent: "final_beat", directive: "Hold the frame, then a fast whip pan with motion blur on the final beat" },
};

export function isCameraPresetId(value: unknown): value is CameraPresetId {
  return typeof value === "string" && (CAMERA_PRESET_IDS as readonly string[]).includes(value);
}

export type TimingSource = "bpm_grid" | "sections" | "scene_bounds";

export interface TimingAnalysis {
  duration_seconds?: number | null;
  bpm?: number | null;
  bpm_confidence?: number | null;
  sections?: Array<{ index?: number; start_time: number; end_time: number }> | null;
}

export interface SceneTiming {
  source: TimingSource;
  note: string;
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
  bpm: number | null;
  beat_seconds: number | null;
  // Absolute song times (seconds) of musical accents inside the scene.
  accents_seconds: number[];
}

const MIN_BPM = 40;
const MAX_BPM = 250;
const MAX_ACCENTS = 64;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function clampSceneRange(start: number, end: number, songDuration: number) {
  if (!Number.isFinite(songDuration) || songDuration <= 0) throw new Error("CAMERA_TIMING_DURATION_MISSING: real song duration is required.");
  const s = Math.min(Math.max(Number.isFinite(start) ? start : 0, 0), songDuration);
  const e = Math.min(Math.max(Number.isFinite(end) ? end : songDuration, 0), songDuration);
  if (e <= s) throw new Error("CAMERA_TIMING_RANGE_INVALID: scene range is empty within the song duration.");
  return { start: round3(s), end: round3(e) };
}

export function usableBpm(analysis: TimingAnalysis | null | undefined): number | null {
  const bpm = Number(analysis?.bpm);
  return Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM ? bpm : null;
}

// Grid points k * (60 / bpm) within [start, end). Anchored at 0s (an estimate).
export function bpmGridTimes(bpm: number, start: number, end: number): number[] {
  const step = 60 / bpm;
  const out: number[] = [];
  for (let k = Math.ceil(start / step - 1e-9); out.length < MAX_ACCENTS; k++) {
    const t = round3(k * step);
    if (t >= end) break;
    if (t >= start) out.push(t);
  }
  return out;
}

export function computeSceneTiming(scene: { start_time: number; end_time: number }, analysis: TimingAnalysis | null | undefined, songDurationOverride?: number): SceneTiming {
  const songDuration = Number(songDurationOverride ?? analysis?.duration_seconds);
  const { start, end } = clampSceneRange(Number(scene.start_time), Number(scene.end_time), songDuration);
  const base = { start_seconds: start, end_seconds: end, duration_seconds: round3(end - start) };
  const bpm = usableBpm(analysis);
  if (bpm) {
    const conf = Number(analysis?.bpm_confidence);
    const confText = Number.isFinite(conf) ? " (BPM confidence " + Math.round(conf * 100) + "%)" : "";
    return { ...base, source: "bpm_grid", bpm, beat_seconds: round3(60 / bpm), accents_seconds: bpmGridTimes(bpm, start, end),
      note: "Estimated beat grid from analyzed BPM " + bpm + confText + ", anchored at 0:00. Not detected beat times." };
  }
  const sections = Array.isArray(analysis?.sections) ? analysis!.sections! : [];
  const boundaries = sections.flatMap((s) => [Number(s.start_time), Number(s.end_time)])
    .filter((t) => Number.isFinite(t) && t >= start && t < end && t <= songDuration)
    .map(round3);
  if (sections.length) {
    return { ...base, source: "sections", bpm: null, beat_seconds: null, accents_seconds: [...new Set(boundaries)].sort((a, b) => a - b).slice(0, MAX_ACCENTS),
      note: "No usable BPM; timed to analyzed section boundaries. No beat timing." };
  }
  return { ...base, source: "scene_bounds", bpm: null, beat_seconds: null, accents_seconds: [start],
    note: "No BPM or sections in song analysis; move spans the scene start to end. No beat timing." };
}

export interface CameraMotionDirective {
  preset: CameraPresetId;
  label: string;
  prompt_directive: string;
  parameters: {
    camera_move: CameraPreset["move"];
    direction: CameraPreset["direction"];
    // Seconds relative to the clip start (0 = scene start).
    move_start_seconds: number;
    move_end_seconds: number;
    accent_offsets_seconds: number[];
    beat_seconds: number | null;
  };
  timing_source: TimingSource;
  timing_note: string;
}

export function presetToDirective(presetId: CameraPresetId, timing: SceneTiming): CameraMotionDirective {
  const preset = CAMERA_PRESETS[presetId];
  if (!preset) throw new Error("CAMERA_PRESET_UNKNOWN: " + String(presetId));
  const rel = (t: number) => round3(t - timing.start_seconds);
  const offsets = timing.accents_seconds.map(rel);
  let moveStart = 0;
  let moveEnd = timing.duration_seconds;
  let timingText: string;
  if (preset.accent === "hold") {
    moveEnd = 0;
    timingText = "Hold for the full " + timing.duration_seconds + "s clip.";
  } else if (preset.accent === "final_beat") {
    const last = offsets.filter((o) => o > 0).pop();
    const fallback = timing.beat_seconds ? Math.max(0, timing.duration_seconds - timing.beat_seconds) : Math.max(0, timing.duration_seconds * 0.85);
    moveStart = round3(last ?? fallback);
    timingText = "Whip at " + moveStart + "s, ending at the cut (" + timing.duration_seconds + "s).";
  } else {
    moveStart = timing.source === "scene_bounds" ? 0 : (offsets[0] ?? 0);
    timingText = "Move from " + moveStart + "s to " + moveEnd + "s"
      + (timing.beat_seconds ? ", pacing accents every " + timing.beat_seconds + "s (estimated from BPM)." : timing.source === "sections" ? ", easing at section boundaries." : ".");
  }
  return {
    preset: preset.id,
    label: preset.label,
    prompt_directive: "CAMERA MOVE: " + preset.directive + ". " + timingText,
    parameters: { camera_move: preset.move, direction: preset.direction, move_start_seconds: moveStart, move_end_seconds: round3(moveEnd), accent_offsets_seconds: offsets, beat_seconds: timing.beat_seconds },
    timing_source: timing.source,
    timing_note: timing.note,
  };
}
