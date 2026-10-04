-- BeatVision 1: Vision Lock persistence
-- Captures the exact approved creative state that downstream Scene Direction
-- and Generation must consume. Providers never become authoritative.

begin;

create table if not exists public.vision_locks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  style_bible_id uuid not null references public.style_bibles(id) on delete restrict,
  song_id uuid not null references public.songs(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  status text not null default 'locked' check (status = 'locked'),
  snapshot jsonb not null default '{}'::jsonb,
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint vision_locks_project_revision_unique unique (project_id, revision_number)
);

create index if not exists vision_locks_project_latest_idx
  on public.vision_locks(project_id, revision_number desc);

create index if not exists vision_locks_world_idx
  on public.vision_locks(world_report_id);

create index if not exists vision_locks_style_idx
  on public.vision_locks(style_bible_id);

-- Once a Vision Lock exists, its snapshot and lineage are immutable. A new
-- creative state gets a new lock revision rather than mutating the old one.
create or replace function public.prevent_vision_lock_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'VISION_LOCK_IMMUTABLE'
    using errcode = '55000',
          detail = 'Vision Locks are immutable. Create a new revision instead.';
end;
$$;

drop trigger if exists vision_locks_immutable on public.vision_locks;
create trigger vision_locks_immutable
before update or delete on public.vision_locks
for each row
execute function public.prevent_vision_lock_mutation();

-- Build and lock a snapshot atomically from the current approved creative
-- state. The caller must own the project. The returned row is the canonical
-- handoff object for Scene Direction and Generation.
create or replace function public.create_vision_lock(p_project_id uuid)
returns public.vision_locks
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_world public.world_reports;
  current_style public.style_bibles;
  current_song public.songs;
  next_revision integer;
  new_lock public.vision_locks;
  snapshot jsonb;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.owner_id = (select auth.uid())
  ) then
    raise exception 'VISION_LOCK_PROJECT_NOT_FOUND_OR_FORBIDDEN'
      using errcode = '42501';
  end if;

  select wr.*
    into current_world
    from public.projects p
    join public.world_reports wr on wr.id = p.world_report_id
   where p.id = p_project_id
     and p.world_approved = true
     and p.world_confirmed_at is not null
     and wr.project_id = p.id
     and wr.status = 'completed'
     and wr.confirmed_at is not null;

  if current_world.id is null then
    raise exception 'VISION_LOCK_WORLD_NOT_CONFIRMED'
      using errcode = '23514';
  end if;

  select sb.*
    into current_style
    from public.style_bibles sb
   where sb.project_id = p_project_id
     and sb.world_report_id = current_world.id
     and sb.status = 'approved'
     and sb.approved_at is not null
   order by sb.created_at desc
   limit 1;

  if current_style.id is null then
    raise exception 'VISION_LOCK_STYLE_NOT_APPROVED'
      using errcode = '23514';
  end if;

  select s.*
    into current_song
    from public.songs s
   where s.project_id = p_project_id
     and s.analysis_status = 'completed'
   order by s.created_at desc
   limit 1;

  if current_song.id is null then
    raise exception 'VISION_LOCK_SONG_NOT_ANALYZED'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.characters c
    where c.project_id = p_project_id
      and c.world_report_id = current_world.id
      and c.style_bible_id = current_style.id
      and c.status <> 'approved'
  ) then
    raise exception 'VISION_LOCK_CHARACTERS_NOT_APPROVED'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.environments e
    where e.project_id = p_project_id
      and e.world_report_id = current_world.id
      and e.style_bible_id = current_style.id
      and e.status <> 'approved'
  ) then
    raise exception 'VISION_LOCK_ENVIRONMENTS_NOT_APPROVED'
      using errcode = '23514';
  end if;

  select coalesce(max(vl.revision_number), 0) + 1
    into next_revision
    from public.vision_locks vl
   where vl.project_id = p_project_id;

  select jsonb_build_object(
    'schema_version', 1,
    'project', jsonb_build_object(
      'id', p.id,
      'title', p.title
    ),
    'song', to_jsonb(current_song),
    'world', to_jsonb(current_world),
    'style_bible', to_jsonb(current_style),
    'characters', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.characters c
      where c.project_id = p_project_id
        and c.world_report_id = current_world.id
        and c.style_bible_id = current_style.id
        and c.status = 'approved'
    ), '[]'::jsonb),
    'character_assets', coalesce((
      select jsonb_agg(to_jsonb(ca) order by ca.created_at, ca.id)
      from public.character_assets ca
      join public.characters c on c.id = ca.character_id
      where ca.project_id = p_project_id
        and ca.world_report_id = current_world.id
        and c.style_bible_id = current_style.id
        and ca.status = 'approved'
    ), '[]'::jsonb),
    'environments', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.environments e
      where e.project_id = p_project_id
        and e.world_report_id = current_world.id
        and e.style_bible_id = current_style.id
        and e.status = 'approved'
    ), '[]'::jsonb),
    'environment_assets', coalesce((
      select jsonb_agg(to_jsonb(ea) order by ea.created_at, ea.id)
      from public.environment_assets ea
      join public.environments e on e.id = ea.environment_id
      where ea.project_id = p_project_id
        and ea.world_report_id = current_world.id
        and e.style_bible_id = current_style.id
        and ea.status = 'approved'
    ), '[]'::jsonb)
  )
  into snapshot
  from public.projects p
  where p.id = p_project_id;

  insert into public.vision_locks (
    project_id,
    world_report_id,
    style_bible_id,
    song_id,
    revision_number,
    snapshot
  )
  values (
    p_project_id,
    current_world.id,
    current_style.id,
    current_song.id,
    next_revision,
    snapshot
  )
  returning * into new_lock;

  return new_lock;
end;
$$;

revoke all on function public.create_vision_lock(uuid) from public;
grant execute on function public.create_vision_lock(uuid) to authenticated;

alter table public.vision_locks enable row level security;

revoke all on table public.vision_locks from anon, authenticated;
grant select on table public.vision_locks to authenticated;

drop policy if exists "vision_locks_owner_select" on public.vision_locks;
create policy "vision_locks_owner_select" on public.vision_locks
for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = vision_locks.project_id
      and p.owner_id = (select auth.uid())
  )
);

commit;
