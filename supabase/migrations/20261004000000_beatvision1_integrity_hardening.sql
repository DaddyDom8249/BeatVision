-- BeatVision 1: production integrity hardening
-- Atomic safety layer for World revisions and approved Visual Plan continuity.
-- This migration is intentionally additive and idempotent where possible.

begin;

alter table public.world_reports
  add column if not exists world_id uuid default gen_random_uuid(),
  add column if not exists revision_number integer;

update public.world_reports
set world_id = coalesce(world_id, gen_random_uuid()),
    revision_number = coalesce(revision_number, 1)
where world_id is null
   or revision_number is null;

alter table public.world_reports
  alter column world_id set default gen_random_uuid(),
  alter column revision_number set default 1,
  alter column revision_number set not null;

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

create index if not exists world_reports_project_revision_idx
  on public.world_reports(project_id, revision_number desc);

create or replace function public.prevent_confirmed_world_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.confirmed_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Confirmed World revisions are immutable. Create a new revision instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists world_reports_confirmed_immutable on public.world_reports;
create trigger world_reports_confirmed_immutable
before update on public.world_reports
for each row
execute function public.prevent_confirmed_world_mutation();

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

create or replace function public.validate_visual_plan_for_approval()
returns trigger
language plpgsql
as $$
declare
  plan_duration double precision;
  scene_count integer;
  first_start double precision;
  last_end double precision;
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

  select count(*), min(start_time), max(end_time)
  into scene_count, first_start, last_end
  from public.visual_plan_scenes
  where visual_plan_id = new.id;

  if scene_count = 0 then
    raise exception using
      errcode = '23514',
      message = 'Cannot approve Visual Plan: at least one scene is required.';
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
      select start_time, end_time,
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
as $$
begin
  if old.status = 'approved' then
    raise exception using
      errcode = '55000',
      message = 'Approved Visual Plan scenes are immutable. Create a new Visual Plan revision instead.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
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
