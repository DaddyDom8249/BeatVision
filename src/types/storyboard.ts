export interface Storyboard {
  id: string;
  project_id: string;
  total_duration: number | null;
  status: string;
  version: number;
}

export interface Scene {
  id: string;
  storyboard_id: string;
  project_id: string;
  scene_index: number;
  start_time: number | null;
  end_time: number | null;
  description: string;
  prompt: string;
  motion_prompt: string;
  status: string;
}
