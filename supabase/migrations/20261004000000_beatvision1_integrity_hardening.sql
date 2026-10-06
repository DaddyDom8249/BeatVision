-- BeatVision 1: production integrity hardening
-- Atomic safety layer for World revisions and approved Visual Plan continuity.
-- This migration tightens the existing Phase 4/World-revision model without
-- introducing a second production schema.

begin;

-- ---------------------------------------------------------------------------
-- World revision integrity
-- ---------------------------------------------------------------------------

alter table public.world_reports
  add column if not exists world_id uuid default gen_random_uuid(),
  add column if not exists revision_number integer;

update public.world_reports
set world_id = gen_random_uuid()
where world_id is null;

-- Never collapse multiple historical rows to revision 1. Existing revision
-- numbers are preserved; only missing numbers are assigned after the current
-- per-project maximum, in deterministic created_at/id order.
with numbered as (
  select
    wr.id,
    wr.project_id,
    row_number() over (
      partition by wr.project_id
      order by wr.created_at nulls first, wr.id
    ) as rn
  from public.world_reports wr
  where wr.revision_number is null
),
offsets as (
  select
    wr.project_id,
    coalesce(max(wr.revision_number), 0) as max_revision
  from public.world_reports wr
  group by wr.project_id
)
update public.world_reports wr
set revision_number = offsets.max_revision + numbered.rn
from numbered
join offsets on offsets.project_id = numbered.project_id
where wr.id = numbered.id;

do $$
begin
  if exists (
    select 1
    from public.world_reports
    where revision_number is null
       or revision_number <= 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'Cannot harden World revisions: every world_reports row must have a positive revision_number.';
  end if;

  if exists (
    select 1
    from public.world_reports
    group by project_id, revision_number
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot harden World revisions: duplicate (project_id, revision_number) rows exist.';
  end if;
end
$$;

alter table public.world_reports
  alter column world_id set default gen_random_uuid(),
  alter column world_id set not null,
  alter column revision_number set default 1,
  alter column revision_number set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_reports'::regclass
      and conname = 'world_reports_revision_number_positive'
  ) then
    alter table public.world_reports
      add constraint world_reports_revision_number_positive
      check (revision_number > 0);
  end if;
end
$$;

-- Phase 2 allowed only one World row per project. Explicit revisions require
-- that obsolete one-row constraint to be removed.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_reports'::regclass
      and conname = 'world_reports_project_unique'
  ) then
    alter table public.world_reports drop constraint world_reports_project_unique;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.world_reports'::regclass
      and conname = 'world_reports_project_revision_unique'
  ) then
    alter table public.world_reports
      add constraint world_reports_project_revision_unique
      unique (project_id, revision_number);
  end if;
end
$$;

-- Avoid retaining the older equivalent unique index if the earlier World
-- revision migration created it.
drop index if exists public.world_reports_project_revision_uidx;

create unique index if not exists world_reports_world_revision_uidx
  on public.world_reports (world_id, revision_number);

create index if not exists world_reports_project_revision_idx
  on public.world_reports(project_id, revision_number desc);

create or replace function public.prevent_confirmed_world_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.confirmed_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Confirmed World revisions are immutable. Create a new revision instead.',
      detail = 'world_report_id=' || old.id::text ||
               ', world_id=' || old.world_id::text ||
               ', revision_number=' || old.revision_number::text;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists world_reports_confirmed_immutable on public.world_reports;
create trigger world_reports_confirmed_immutable
before update or delete on public.world_reports
for each row
execute function public.prevent_confirmed_world_mutation();

-- ---------------------------------------------------------------------------
-- Visual Plan scene integrity
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.visual_plan_scenes') is not null then
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.visual_plan_scenes'::regclass
        and conname = 'visual_plan_scenes_plan_scene_number_unique'
    ) then
      alter table public.visual_plan_scenes
        add constraint visual_plan_scenes_plan_scene_number_unique
        unique (visual_plan_id, scene_number);
    end if;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.visual_plan_scenes'::regclass
        and conname = 'visual_plan_scenes_time_window_valid'
    ) then
      alter table public.visual_plan_scenes
        add constraint visual_plan_scenes_time_window_valid
        check (start_time >= 0 and end_time > start_time) not valid;
    end if;
  end if;
end
$$;

-- A scene must point at the same project/World/Style/Song as its parent plan.
-- Foreign keys alone do not enforce this cross-table lineage.
create or replace function public.validate_visual_plan_scene_parent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.visual_plans vp
    where vp.id = new.visual_plan_id
      and vp.project_id = new.project_id
      and vp.world_report_id = new.world_report_id
      and vp.style_bible_id = new.style_bible_id
      and vp.song_id = new.song_id
  ) then
    raise exception 'VISUAL_PLAN_SCENE_PARENT_MISMATCH'
      using errcode = '23514',
            detail = 'Visual Plan Scene lineage must match its parent Visual Plan.';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.visual_plan_scenes') is not null
     and to_regclass('public.visual_plans') is not null then
    drop trigger if exists visual_plan_scenes_parent_lineage on public.visual_plan_scenes;
    create trigger visual_plan_scenes_parent_lineage
    before insert or update on public.visual_plan_scenes
    for each row
    execute function public.validate_visual_plan_scene_parent();
  end if;
end
$$;

create or replace function public.validate_visual_plan_for_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  plan_duration double precision;
  scene_count integer;
  first_start double precision;
  last_end double precision;
  min_scene_number integer;
  max_scene_number integer;
  has_gap boolean;
  has_invalid_window boolean;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return new;
  end if;

  if to_regclass('public.visual_plan_scenes') is null then
    raise exception using
      errcode = '55000',
      message = 'Cannot approve Visual Plan: visual_plan_scenes table is unavailable.';
  end if;

  plan_duration := new.duration_seconds;
  if plan_duration is null or plan_duration <= 0 then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: duration_seconds must be positive.';
  end if;

  select
    count(*),
    min(start_time),
    max(end_time),
    min(scene_number),
    max(scene_number)
  into scene_count, first_start, last_end, min_scene_number, max_scene_number
  from public.visual_plan_scenes
  where visual_plan_id = new.id;

  if scene_count = 0 then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: at least one scene is required.';
  end if;

  -- With positive unique scene numbers, min=1 and max=count is equivalent to
  -- an exact contiguous sequence 1..N.
  if min_scene_number <> 1 or max_scene_number <> scene_count then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: scene numbers must be contiguous from 1 through N.';
  end if;

  if abs(coalesce(first_start, -1)) > 0.001 then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: first scene must start at 0 seconds.';
  end if;

  if abs(coalesce(last_end, -1) - plan_duration) > 0.001 then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: final scene must end at the analyzed song duration.';
  end if;

  select exists (
    select 1
    from (
      select
        start_time,
        end_time,
        lag(end_time) over (order by scene_number) as previous_end
      from public.visual_plan_scenes
      where visual_plan_id = new.id
    ) windows
    where previous_end is not null
      and abs(start_time - previous_end) > 0.001
  ) into has_gap;

  if has_gap then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: scene timecodes contain a gap or overlap.';
  end if;

  select exists (
    select 1
    from public.visual_plan_scenes
    where visual_plan_id = new.id
      and (start_time < 0 or end_time <= start_time or end_time > plan_duration)
  ) into has_invalid_window;

  if has_invalid_window then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: one or more scene windows are outside the song duration.';
  end if;

  -- Re-check parent lineage at the approval boundary so a malformed scene
  -- cannot be locked by a plan-level update.
  if exists (
    select 1
    from public.visual_plan_scenes s
    where s.visual_plan_id = new.id
      and (
        s.project_id <> new.project_id
        or s.world_report_id <> new.world_report_id
        or s.style_bible_id <> new.style_bible_id
        or s.song_id <> new.song_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: one or more scenes do not match the plan lineage.';
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.visual_plans') is not null then
    drop trigger if exists visual_plans_validate_approval on public.visual_plans;
    create trigger visual_plans_validate_approval
    before update on public.visual_plans
    for each row
    execute function public.validate_visual_plan_for_approval();
  end if;
end
$$;

create or replace function public.prevent_approved_visual_plan_scene_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception using
      errcode = '55000',
      message = 'Approved Visual Plan scenes are immutable. Create a new Visual Plan revision instead.';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  if to_regclass('public.visual_plan_scenes') is not null then
    drop trigger if exists visual_plan_scenes_approved_immutable_update on public.visual_plan_scenes;
    create trigger visual_plan_scenes_approved_immutable_update
    before update on public.visual_plan_scenes
    for each row
    execute function public.prevent_approved_visual_plan_scene_mutation();

    drop trigger if exists visual_plan_scenes_approved_immutable_delete on public.visual_plan_scenes;
    create trigger visual_plan_scenes_approved_immutable_delete
    before delete on public.visual_plan_scenes
    for each row
    execute function public.prevent_approved_visual_plan_scene_mutation();
  end if;
end
$$;

commit;
