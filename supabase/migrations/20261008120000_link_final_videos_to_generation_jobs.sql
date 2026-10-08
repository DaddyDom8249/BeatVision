-- Link final videos to their immutable assembly jobs; keep legacy rows without
-- a generation_job_id readable, and retain finished media if a job is removed.
alter table public.final_videos
  add column if not exists generation_job_id uuid
    references public.generation_jobs(id) on delete restrict;

-- PostgreSQL UNIQUE permits multiple NULLs by default. A non-partial unique
-- index is required for PostgREST upsert(onConflict: "generation_job_id").
-- Partial unique indexes cannot be inferred by ON CONFLICT (generation_job_id)
-- without a matching conflict-target predicate.
create unique index if not exists final_videos_generation_job_id_uidx
  on public.final_videos(generation_job_id);
