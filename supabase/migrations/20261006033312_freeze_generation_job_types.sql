alter table public.generation_jobs
  add constraint generation_jobs_canonical_job_type_check
  check (job_type in ('scene_image', 'scene_motion'));
