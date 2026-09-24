ALTER TABLE public.video_render_jobs
  ADD COLUMN IF NOT EXISTS provider_render_id text;

CREATE INDEX IF NOT EXISTS video_render_jobs_provider_render_id_idx
  ON public.video_render_jobs(provider_render_id)
  WHERE provider_render_id IS NOT NULL;
