-- Link final_videos to generation_jobs and enforce 1:1 uniqueness per assembly generation job.
alter table public.final_videos
  add column if not exists generation_job_id uuid references public.generation_jobs(id) on delete cascade;

create unique index if not exists final_videos_generation_job_id_uidx
  on public.final_videos(generation_job_id)
  where generation_job_id is not null;
