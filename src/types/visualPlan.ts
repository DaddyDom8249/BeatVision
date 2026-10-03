export type VisualPlanStatus = "draft" | "approved";

export interface VisualPlan {
  id: string;
  project_id: string;
  world_report_id: string;
  style_bible_id: string;
  song_id: string;
  status: VisualPlanStatus;
  title: string;
  duration_seconds: number | null;
  creative_thesis: string | null;
  global_direction: Record<string, unknown>;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VisualPlanScene {
  id: string;
  visual_plan_id: string;
  project_id: string;
  world_report_id: string;
  style_bible_id: string;
  song_id: string;
  scene_number: number;
  section_index: number | null;
  start_time: number;
  end_time: number;
  title: string;
  visual_direction: string;
  camera_direction: string;
  movement_direction: string;
  location: string;
  mood: string;
  lyric_moment: string;
  transition_style: string;
  continuity_notes: string;
  status: "draft" | "approved";
  created_at: string;
  updated_at: string;
}