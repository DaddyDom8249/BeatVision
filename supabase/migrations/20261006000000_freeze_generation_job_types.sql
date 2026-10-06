-- BeatVision canonical runtime freeze: assembly remains locked until the
-- storyboard, motion, and Shotstack phases are proven end-to-end.
-- Additive constraint: preserve all existing data and reject new assembly jobs.

alter table public.generation_jobs
  add constraint generation_jobs_canonical_job_type_check
  check (job_type in ('scene_image', 'scene_motion'));

-- Assembly will receive its own explicit migration only after P4-P6 gates pass.
