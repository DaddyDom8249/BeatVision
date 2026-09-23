export type TimelineScene = {
  scene_id: string;
  project_id: string;
  song_id: string;
  index: number;
  start_time: number;
  end_time: number;
  duration: number;
  section: string;
  visual_purpose: string;
  environment: string;
  characters: string[];
  prompt: string;
  motion: string | null;
  asset: string | null;
  status: string;
  error: string | null;
};

export type TimelineClip = {
  scene_id: string;
  asset_id: string;
  source_url: string;
  start_time: number;
  end_time: number;
  duration: number;
  generation_type: 'GENERATIVE_VIDEO' | 'CAMERA_MOTION_FALLBACK';
  allow_reuse?: boolean;
};

const clean = (value: unknown, fallback = '') => String(value ?? fallback).trim();

export function stableSceneId(projectId: string, songId: string, index: number, start: number, end: number): string {
  return `scene:${clean(projectId, 'project')}:${clean(songId, 'song')}:${index}:${start.toFixed(3)}-${end.toFixed(3)}`;
}

export function buildMasterTimeline(input: any): TimelineScene[] {
  const projectId = clean(input?.project_id, 'project');
  const songId = clean(input?.song_id, 'song');
  const duration = Number(input?.song_duration_seconds);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('TIMELINE_INVALID_SONG_DURATION');
  const requested = Array.isArray(input?.scenes) ? input.scenes : [];
  if (!requested.length) throw new Error('TIMELINE_REQUIRES_SCENES');

  const scenes: TimelineScene[] = [];
  let cursor = 0;

  for (let i = 0; i < requested.length; i += 1) {
    const raw = requested[i] || {};
    const remaining = Math.max(0, duration - cursor);
    const proposed = Number(raw.duration ?? raw.duration_seconds ?? remaining);
    const segment = Math.min(Math.max(proposed > 0 ? proposed : remaining, 0.001), remaining);
    const start = cursor;
    const end = i === requested.length - 1 ? duration : Math.min(duration, cursor + segment);
    const sceneId = stableSceneId(projectId, songId, i + 1, start, end);

    scenes.push({
      scene_id: sceneId,
      project_id: projectId,
      song_id: songId,
      index: i + 1,
      start_time: start,
      end_time: end,
      duration: end - start,
      section: clean(raw.section, 'unknown'),
      visual_purpose: clean(raw.visual_purpose, 'song-grounded visual coverage'),
      environment: clean(raw.environment, 'approved environment'),
      characters: Array.isArray(raw.characters) ? raw.characters.map((x: unknown) => clean(x)).filter(Boolean) : [],
      prompt: clean(raw.prompt),
      motion: raw.motion == null ? null : clean(raw.motion),
      asset: raw.asset == null ? null : clean(raw.asset),
      status: clean(raw.status, 'planned'),
      error: raw.error == null ? null : clean(raw.error),
    });

    cursor = end;
  }

  if (Math.abs(cursor - duration) > 0.05) throw new Error('TIMELINE_DOES_NOT_COVER_SONG');
  return scenes;
}

export function assembleTimeline(scenes: TimelineScene[], clips: TimelineClip[], songDuration: number) {
  const ordered = [...scenes].sort((a, b) => a.start_time - b.start_time);
  if (!ordered.length) throw new Error('ASSEMBLY_REQUIRES_SCENES');

  const byScene = new Map(clips.map((clip) => [clip.scene_id, clip]));
  const output = ordered.map((scene) => {
    const clip = byScene.get(scene.scene_id);
    if (!clip) throw new Error(`ASSEMBLY_MISSING_ASSET:${scene.scene_id}`);
    if (clip.start_time > scene.start_time + 0.05 || clip.end_time < scene.end_time - 0.05) {
      throw new Error(`ASSEMBLY_CLIP_DOES_NOT_COVER_SCENE:${scene.scene_id}`);
    }
    return { ...clip, scene_id: scene.scene_id, timeline_start: scene.start_time, timeline_end: scene.end_time };
  });

  for (let i = 1; i < output.length; i += 1) {
    if (output[i].scene_id === output[i - 1].scene_id) throw new Error('ASSEMBLY_DUPLICATE_ADJACENT_SCENE');
    if (output[i].asset_id === output[i - 1].asset_id && !output[i].allow_reuse) {
      throw new Error('ASSEMBLY_ACCIDENTAL_ADJACENT_REUSE');
    }
  }

  const end = output[output.length - 1].timeline_end;
  if (Math.abs(end - songDuration) > 0.05) throw new Error('ASSEMBLY_DURATION_MISMATCH');
  return { song_duration: songDuration, timeline_duration: end, scene_count: output.length, clips: output };
}
