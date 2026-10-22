-- Synthetic schema for isolated PostgreSQL 17 migration validation.
-- This is a contract fixture, NOT a replacement for full Supabase migration replay.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema extensions;
create schema storage;
create extension if not exists pgcrypto with schema extensions;
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create table public.projects (
  id uuid primary key, owner_id uuid not null, world_report_id uuid,
  world_confirmed_at timestamptz, title text
);
create table public.songs (
  id uuid primary key, project_id uuid not null, title text, artist text,
  audio_path text, audio_revision uuid, analysis_status text, analysis jsonb,
  lyrics text, creative_direction text, notes text, updated_at timestamptz default now()
);
create table public.world_reports (
  id uuid primary key, project_id uuid, interpretation_id uuid,
  interpretation_source_fingerprint text, confirmed_at timestamptz,
  world_id uuid, revision_number integer, status text,
  mood jsonb, emotional_arc jsonb, visual_language jsonb, cinematography jsonb,
  environments jsonb, color_lighting jsonb, motifs jsonb, atmosphere jsonb,
  movement jsonb, continuity_rules jsonb, immutable_continuity jsonb,
  raw_report jsonb, provider text, provider_request_id text
);
create table public.vision_locks (
  id uuid primary key, project_id uuid, world_report_id uuid,
  style_bible_id uuid, song_id uuid, revision_number integer,
  status text, snapshot jsonb
);
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(), project_id uuid,
  vision_lock_id uuid, job_type text, status text, input_snapshot jsonb
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text
);
alter table storage.objects enable row level security;
grant all on public.projects, public.songs, public.world_reports,
  public.vision_locks, public.generation_jobs to service_role;
