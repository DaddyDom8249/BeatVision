export type SceneState = "draft" | "generating" | "generated" | "approved";

export interface SceneImage {
  id: string;
  scene_id: string;
  project_id: string;
  batch_id: string;
  provider: string;
  image_url: string;
  status: string;
  approved: boolean;
  created_at: string;
}
