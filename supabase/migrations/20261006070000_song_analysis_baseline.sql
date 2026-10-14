-- Required runtime fields missing from the phase-1 repository baseline.
-- Additive only; preserve existing analysis values and audio revisions.
alter table public.songs
  add column if not exists analysis_status text not null default 'not_started',
  add column if not exists analysis jsonb,
  add column if not exists analyzed_at timestamptz;
