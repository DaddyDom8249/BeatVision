import { supabase } from '@/db/supabase';
import type {
  CharacterEnvironment,
  CharacterSheet,
  EnvironmentSheet,
  FinalVideo,
  MotionClip,
  MotionSettings,
  Project,
  ProjectChangeLog,
  SceneImage,
  SceneMotionPlan,
  ScenePreview,
  SceneVideo,
  SceneVisualPrompt,
  StoryboardScene,
  VideoRenderJob,
  VisualWorldReport,
  WorldStyleBible,
} from '@/types/types';

export interface ProjectAggregate {
  project: Project;
  worldReport: VisualWorldReport | null;
  scenes: StoryboardScene[];
  charEnv: CharacterEnvironment | null;
  scenePrompts: SceneVisualPrompt[];
  scenePreviews: ScenePreview[];
  styleBible: WorldStyleBible | null;
  characterSheet: CharacterSheet | null;
  envSheet: EnvironmentSheet | null;
  sceneImages: SceneImage[];
  sceneVideos: SceneVideo[];
  motionSettings: MotionSettings | null;
  motionPlans: SceneMotionPlan[];
  motionClips: MotionClip[];
  renderJob: VideoRenderJob | null;
  finalVideo: FinalVideo | null;
  changeLogs: ProjectChangeLog[];
}

type AggregateRow = {
  project?: Project | null;
  worldReport?: VisualWorldReport | null;
  scenes?: StoryboardScene[] | null;
  charEnv?: CharacterEnvironment | null;
  scenePrompts?: SceneVisualPrompt[] | null;
  scenePreviews?: ScenePreview[] | null;
  styleBible?: WorldStyleBible | null;
  characterSheet?: CharacterSheet | null;
  envSheet?: EnvironmentSheet | null;
  sceneImages?: SceneImage[] | null;
  sceneVideos?: SceneVideo[] | null;
  motionSettings?: MotionSettings | null;
  motionPlans?: SceneMotionPlan[] | null;
  motionClips?: MotionClip[] | null;
  renderJob?: VideoRenderJob | null;
  finalVideo?: FinalVideo | null;
  changeLogs?: ProjectChangeLog[] | null;
};

const emptyArray = <T,>(value: T[] | null | undefined): T[] => Array.isArray(value) ? value : [];

export async function loadProjectAggregate(projectId: string): Promise<ProjectAggregate | null> {
  const normalizedId = String(projectId || '').trim();
  if (!normalizedId) throw new Error('Project ID is required.');

  const { data, error } = await supabase.rpc('beatvision_project_aggregate', {
    p_project_id: normalizedId,
  });

  if (error) throw error;
  if (!data) return null;

  const row = data as AggregateRow;
  if (!row.project) return null;

  return {
    project: row.project,
    worldReport: row.worldReport ?? null,
    scenes: emptyArray(row.scenes),
    charEnv: row.charEnv ?? null,
    scenePrompts: emptyArray(row.scenePrompts),
    scenePreviews: emptyArray(row.scenePreviews),
    styleBible: row.styleBible ?? null,
    characterSheet: row.characterSheet ?? null,
    envSheet: row.envSheet ?? null,
    sceneImages: emptyArray(row.sceneImages),
    sceneVideos: emptyArray(row.sceneVideos),
    motionSettings: row.motionSettings ?? null,
    motionPlans: emptyArray(row.motionPlans),
    motionClips: emptyArray(row.motionClips),
    renderJob: row.renderJob ?? null,
    finalVideo: row.finalVideo ?? null,
    changeLogs: emptyArray(row.changeLogs),
  };
}
