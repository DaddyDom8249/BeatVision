-- BeatVision canonical runtime freeze: generation_jobs may only represent
-- controller-backed scene image or scene motion jobs. Assembly remains locked
-- until the storyboard/motion/Shotstack phases are proven end-to-end.

alter table public.generation_jobs
  drop constraint if exists generation_jobs_job_type_check;

alter table public.generation_jobs
  add constraint generation_jobs_job_type_check
  check (job_type in ('scene_image', 'scene_motion'));

-- No assembly jobs are permitted by the canonical runtime contract.
-- Assembly will receive its own explicit migration only after P4-P6 gates pass.
