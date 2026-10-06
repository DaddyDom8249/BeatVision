-- BeatVision source-of-truth reconciliation
-- Safe forward-only repair for the live schema and fresh resets.

-- The application uses projects.owner_id. Phase 3 policies depend on it.
-- This is idempotent for environments where the column already exists.
alter table public.projects
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

update public.projects
set owner_id = user_id
where owner_id is null
  and user_id is not null;

-- Existing production projects are expected to have an owner.
do $$
begin
  if exists (select 1 from public.projects where owner_id is null) then
    raise exception 'PROJECT_OWNER_ID_NULL';
  end if;
end $$;

alter table public.projects
  alter column owner_id set not null;

create index if not exists projects_owner_id_idx on public.projects(owner_id);

-- The frontend stores uploads in the songs bucket and uses signed URLs.
insert into storage.buckets (id, name, public)
values ('songs', 'songs', false)
on conflict (id) do update set public = false;

-- Lyrics and creative direction are optional UI inputs.
alter table public.songs
  alter column lyrics drop not null,
  alter column creative_direction drop not null;

-- Harden trigger resolution against caller-controlled search_path.
alter function public.set_updated_at()
  set search_path = public;
