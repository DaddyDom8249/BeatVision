-- Assembly is already supported by enqueue/controller and the original job-type check.
-- Replace only the contradictory canonical constraint; retain all other checks and RLS.
begin;
alter table public.generation_jobs drop constraint generation_jobs_canonical_job_type_check;
alter table public.generation_jobs add constraint generation_jobs_canonical_job_type_check
  check (job_type in ('scene_image', 'scene_motion', 'assembly'));
commit;
