ALTER TABLE public.motion_clips
  ADD COLUMN IF NOT EXISTS status public.motion_clip_status NOT NULL DEFAULT 'not_generated',
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_job_id text;

CREATE INDEX IF NOT EXISTS motion_clips_project_provider_job_idx
  ON public.motion_clips(project_id, provider_job_id)
  WHERE provider_job_id IS NOT NULL;