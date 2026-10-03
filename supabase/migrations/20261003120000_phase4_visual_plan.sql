-- Phase 4: Visual Plan
-- A Visual Plan is derived only from the currently confirmed World and approved Style Bible.

create table if not exists public.visual_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  style_bible_id uuid not null references public.style_bibles(id) on delete restrict,
  song_id uuid not null references public.songs(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  title text not null default 'Visual Plan',
  duration_seconds numeric,
  creative_thesis text,
  global_direction jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visual_plans_project_unique unique (project_id),
  constraint visual_plans_lock_consistency check (
    (status = 'draft' and locked_at is null)
    or (status = 'approved' and locked_at is not null)
  )
);

create table if not exists public.visual_plan_scenes (
  id uuid primary key default gen_random_uuid(),
  visual_plan_id uuid not null references public.visual_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  style_bible_id uuid not null references public.style_bibles(id) on delete restrict,
  song_id uuid not null references public.songs(id) on delete restrict,
  scene_number integer not null check (scene_number > 0),
  section_index integer,
  start_time numeric not null check (start_time >= 0),
  end_time numeric not null check (end_time > start_time),
  title text not null,
  visual_direction text not null default '',
  camera_direction text not null default '',
  movement_direction text not null default '',
  location text not null default '',
  mood text not null default '',
  lyric_moment text not null default '',
  transition_style text not null default '',
  continuity_notes text not null default '',
  status text not null default 'draft' check (status in ('draft', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visual_plan_scenes_plan_number_unique unique (visual_plan_id, scene_number),
  constraint visual_plan_scenes_range_valid check (end_time > start_time)
);

create index if not exists visual_plans_project_idx on public.visual_plans(project_id);
create index if not exists visual_plans_world_idx on public.visual_plans(world_report_id);
create index if not exists visual_plans_style_idx on public.visual_plans(style_bible_id);
create index if not exists visual_plan_scenes_project_idx on public.visual_plan_scenes(project_id);
create index if not exists visual_plan_scenes_plan_idx on public.visual_plan_scenes(visual_plan_id);
create index if not exists visual_plan_scenes_timing_idx on public.visual_plan_scenes(visual_plan_id, start_time);

create or replace function public.require_current_visual_plan_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_world_id uuid;
  style_world_id uuid;
begin
  select p.world_report_id
    into current_world_id
    from public.projects p
   where p.id = new.project_id;

  select sb.world_report_id
    into style_world_id
    from public.style_bibles sb
   where sb.id = new.style_bible_id
     and sb.project_id = new.project_id
     and sb.status = 'approved'
     and sb.approved_at is not null;

  if current_world_id is null
     or current_world_id <> new.world_report_id then
    raise exception 'VISUAL_PLAN_WORLD_NOT_CURRENT'
      using errcode = '23514',
            detail = 'Visual Plan must reference the project''s current World revision.';
  end if;

  if not exists (
    select 1
      from public.world_reports wr
     where wr.id = new.world_report_id
       and wr.project_id = new.project_id
       and wr.status = 'completed'
       and wr.confirmed_at is not null
  ) then
    raise exception 'VISUAL_PLAN_WORLD_NOT_CONFIRMED'
      using errcode = '23514',
            detail = 'Visual Plan requires the confirmed Visual World Report.';
  end if;

  if style_world_id is null or style_world_id <> new.world_report_id then
    raise exception 'VISUAL_PLAN_STYLE_NOT_CURRENT'
      using errcode = '23514',
            detail = 'Visual Plan requires an approved Style Bible bound to the current World revision.';
  end if;

  if not exists (
    select 1
      from public.songs s
     where s.id = new.song_id
       and s.project_id = new.project_id
       and s.analysis_status = 'completed'
  ) then
    raise exception 'VISUAL_PLAN_SONG_NOT_ANALYZED'
      using errcode = '23514',
            detail = 'Visual Plan requires a completed song analysis.';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_approved_visual_plan_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'VISUAL_PLAN_IMMUTABLE'
      using errcode = '55000',
            detail = 'Approved Visual Plans are immutable; create a new plan instead.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists visual_plans_require_lineage on public.visual_plans;
create trigger visual_plans_require_lineage
before insert or update on public.visual_plans
for each row execute function public.require_current_visual_plan_lineage();

drop trigger if exists visual_plans_immutable on public.visual_plans;
create trigger visual_plans_immutable
before update or delete on public.visual_plans
for each row execute function public.prevent_approved_visual_plan_mutation();

drop trigger if exists visual_plan_scenes_require_lineage on public.visual_plan_scenes;
create trigger visual_plan_scenes_require_lineage
before insert or update on public.visual_plan_scenes
for each row execute function public.require_current_visual_plan_lineage();

drop trigger if exists visual_plan_scenes_immutable on public.visual_plan_scenes;
create trigger visual_plan_scenes_immutable
before update or delete on public.visual_plan_scenes
for each row execute function public.prevent_approved_visual_plan_mutation();

drop trigger if exists visual_plans_set_updated_at on public.visual_plans;
create trigger visual_plans_set_updated_at
before update on public.visual_plans
for each row execute function public.set_updated_at();

drop trigger if exists visual_plan_scenes_set_updated_at on public.visual_plan_scenes;
create trigger visual_plan_scenes_set_updated_at
before update on public.visual_plan_scenes
for each row execute function public.set_updated_at();

alter table public.visual_plans enable row level security;
alter table public.visual_plan_scenes enable row level security;

revoke all on table public.visual_plans from anon, authenticated;
revoke all on table public.visual_plan_scenes from anon, authenticated;

grant select, insert, update on table public.visual_plans to authenticated;
grant select, insert, update on table public.visual_plan_scenes to authenticated;

drop policy if exists "visual_plans_owner_select" on public.visual_plans;
create policy "visual_plans_owner_select" on public.visual_plans
for select to authenticated
using (exists (
  select 1 from public.projects p
   where p.id = visual_plans.project_id
     and p.owner_id = (select auth.uid())
));

drop policy if exists "visual_plans_owner_insert" on public.visual_plans;
create policy "visual_plans_owner_insert" on public.visual_plans
for insert to authenticated
with check (exists (
  select 1 from public.projects p
   where p.id = visual_plans.project_id
     and p.owner_id = (select auth.uid())
));

drop policy if exists "visual_plans_owner_update" on public.visual_plans;
create policy "visual_plans_owner_update" on public.visual_plans
for update to authenticated
using (exists (
  select 1 from public.projects p
   where p.id = visual_plans.project_id
     and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
   where p.id = visual_plans.project_id
     and p.owner_id = (select auth.uid())
));

drop policy if exists "visual_plan_scenes_owner_select" on public.visual_plan_scenes;
create policy "visual_plan_scenes_owner_select" on public.visual_plan_scenes
for select to authenticated
using (exists (
  select 1 from public.projects p
   where p.id = visual_plan_scenes.project_id
     and p.owner_id = (select auth.uid())
));

drop policy if exists "visual_plan_scenes_owner_insert" on public.visual_plan_scenes;
create policy "visual_plan_scenes_owner_insert" on public.visual_plan_scenes
for insert to authenticated
with check (exists (
  select 1 from public.projects p
   where p.id = visual_plan_scenes.project_id
     and p.owner_id = (select auth.uid())
));

drop policy if exists "visual_plan_scenes_owner_update" on public.visual_plan_scenes;
create policy "visual_plan_scenes_owner_update" on public.visual_plan_scenes
for update to authenticated
using (exists (
  select 1 from public.projects p
   where p.id = visual_plan_scenes.project_id
     and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.projects p
   where p.id = visual_plan_scenes.project_id
     and p.owner_id = (select auth.uid())
));