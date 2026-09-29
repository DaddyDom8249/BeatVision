export type JobState = "queued" | "submitted" | "processing" | "completed" | "failed";

export interface MotionJob {
  id: string;
  scene_id: string;
  provider: string;
  provider_job_id: string | null;
  status: JobState;
  video_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
