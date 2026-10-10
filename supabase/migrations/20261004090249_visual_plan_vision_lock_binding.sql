-- BeatVision 1: bind Visual Plan authority to immutable Vision Lock.
-- Existing visual_plan_scenes remain the canonical Scene Direction contract.

alter table public.visual_plans
  add column if not exists vision_lock_id uuid;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'visual_plans_vision_lock_fk'
       and conrelid = 'public.visual_plans'::regclass
  ) then
    alter table public.visual_plans
      add constraint visual_plans_vision_lock_fk
      foreign key (vision_lock_id)
      references public.vision_locks(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists visual_plans_vision_lock_idx
  on public.visual_plans(vision_lock_id);


-- Compatibility backfill: production already contains approved Visual Plans.
-- Preserve those approved plans by creating an immutable lock from their exact
-- World/Style/Song lineage before enforcing the new lock requirement.
create temporary table _beatvision_vision_lock_backfill (
  plan_id uuid primary key,
  lock_id uuid not null
) on commit drop;

drop trigger if exists visual_plans_immutable on public.visual_plans;

with candidates as (
  select
    vp.*,
    row_number() over (
      partition by vp.project_id
      order by vp.created_at, vp.id
    ) as rn
  from public.visual_plans vp
  where vp.status = 'approved'
    and vp.vision_lock_id is null
),
numbered as (
  select
    c.*,
    coalesce((
      select max(vl.revision_number)
      from public.vision_locks vl
      where vl.project_id = c.project_id
    ), 0) + c.rn as revision_number
  from candidates c
)
insert into public.vision_locks (
  project_id,
  world_report_id,
  style_bible_id,
  song_id,
  revision_number,
  snapshot
)
select
  n.project_id,
  n.world_report_id,
  n.style_bible_id,
  n.song_id,
  n.revision_number,
  jsonb_build_object(
    'schema_version', 1,
    'migration_backfill', true,
    'project', jsonb_build_object(
      'id', p.id,
      'title', p.title
    ),
    'song', to_jsonb(s),
    'world', to_jsonb(wr),
    'style_bible', to_jsonb(sb),
    'characters', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.characters c
      where c.project_id = n.project_id
        and c.world_report_id = n.world_report_id
        and c.style_bible_id = n.style_bible_id
        and c.status = 'approved'
    ), '[]'::jsonb),
    'character_assets', coalesce((
      select jsonb_agg(to_jsonb(ca) order by ca.created_at, ca.id)
      from public.character_assets ca
      join public.characters c on c.id = ca.character_id
      where ca.project_id = n.project_id
        and ca.world_report_id = n.world_report_id
        and c.style_bible_id = n.style_bible_id
        and ca.status = 'approved'
    ), '[]'::jsonb),
    'environments', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.environments e
      where e.project_id = n.project_id
        and e.world_report_id = n.world_report_id
        and e.style_bible_id = n.style_bible_id
        and e.status = 'approved'
    ), '[]'::jsonb),
    'environment_assets', coalesce((
      select jsonb_agg(to_jsonb(ea) order by ea.created_at, ea.id)
      from public.environment_assets ea
      join public.environments e on e.id = ea.environment_id
      where ea.project_id = n.project_id
        and ea.world_report_id = n.world_report_id
        and e.style_bible_id = n.style_bible_id
        and ea.status = 'approved'
    ), '[]'::jsonb)
  )
from numbered n
join public.projects p on p.id = n.project_id
join public.songs s on s.id = n.song_id
join public.world_reports wr on wr.id = n.world_report_id
join public.style_bibles sb on sb.id = n.style_bible_id
returning id, project_id, revision_number;

insert into _beatvision_vision_lock_backfill (plan_id, lock_id)
select vp.id, vl.id
from public.visual_plans vp
join public.vision_locks vl
  on vl.project_id = vp.project_id
 and vl.world_report_id = vp.world_report_id
 and vl.style_bible_id = vp.style_bible_id
 and vl.song_id = vp.song_id
where vp.status = 'approved'
  and vp.vision_lock_id is null
  and vl.revision_number = (
    select max(vl2.revision_number)
    from public.vision_locks vl2
    where vl2.project_id = vp.project_id
      and vl2.world_report_id = vp.world_report_id
      and vl2.style_bible_id = vp.style_bible_id
      and vl2.song_id = vp.song_id
  );

update public.visual_plans vp
set vision_lock_id = b.lock_id
from _beatvision_vision_lock_backfill b
where vp.id = b.plan_id;

create trigger visual_plans_immutable
before update or delete on public.visual_plans
for each row execute function public.prevent_approved_visual_plan_mutation();

alter table public.visual_plans
  add constraint visual_plans_vision_lock_required
  check (status = 'draft' or vision_lock_id is not null);

create or replace function public.require_visual_plan_vision_lock_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  lock_project_id uuid;
  lock_world_id uuid;
  lock_style_id uuid;
  lock_song_id uuid;
begin
  if new.vision_lock_id is null then
    if new.status = 'approved' then
      raise exception 'VISUAL_PLAN_VISION_LOCK_REQUIRED'
        using errcode = '23514',
              detail = 'A Visual Plan cannot be approved without an immutable Vision Lock.';
    end if;
    return new;
  end if;

  select vl.project_id, vl.world_report_id, vl.style_bible_id, vl.song_id
    into lock_project_id, lock_world_id, lock_style_id, lock_song_id
    from public.vision_locks vl
   where vl.id = new.vision_lock_id;

  if lock_project_id is null
     or lock_project_id <> new.project_id
     or lock_world_id <> new.world_report_id
     or lock_style_id <> new.style_bible_id
     or lock_song_id <> new.song_id then
    raise exception 'VISUAL_PLAN_VISION_LOCK_LINEAGE_MISMATCH'
      using errcode = '23514',
            detail = 'Visual Plan must use a Vision Lock for the same project, World, Style Bible, and Song.';
  end if;

  return new;
end;
$$;

drop trigger if exists visual_plans_require_vision_lock on public.visual_plans;
create trigger visual_plans_require_vision_lock
before insert or update on public.visual_plans
for each row execute function public.require_visual_plan_vision_lock_lineage();

create or replace function public.require_current_visual_plan_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_world_id uuid;
  style_world_id uuid;
  plan_project_id uuid;
  plan_world_id uuid;
  plan_style_id uuid;
  plan_song_id uuid;
  plan_lock_id uuid;
  scene_lock_id uuid;
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

  if tg_table_name = 'visual_plan_scenes' then
    select vp.project_id, vp.world_report_id, vp.style_bible_id, vp.song_id, vp.vision_lock_id
      into plan_project_id, plan_world_id, plan_style_id, plan_song_id, plan_lock_id
      from public.visual_plans vp
     where vp.id = new.visual_plan_id;

    if plan_project_id is null
       or plan_project_id <> new.project_id
       or plan_world_id <> new.world_report_id
       or plan_style_id <> new.style_bible_id
       or plan_song_id <> new.song_id then
      raise exception 'VISUAL_PLAN_SCENE_LINEAGE_MISMATCH'
        using errcode = '23514',
              detail = 'Visual Plan scenes must use the same project, World, Style Bible, and Song as their parent plan.';
    end if;

    if plan_lock_id is null then
      raise exception 'VISUAL_PLAN_SCENE_VISION_LOCK_REQUIRED'
        using errcode = '23514',
              detail = 'Scene Direction cannot exist without a Vision Lock-bound Visual Plan.';
    end if;

    scene_lock_id := plan_lock_id;
    if not exists (
      select 1
        from public.vision_locks vl
       where vl.id = scene_lock_id
         and vl.project_id = new.project_id
         and vl.world_report_id = new.world_report_id
         and vl.style_bible_id = new.style_bible_id
         and vl.song_id = new.song_id
    ) then
      raise exception 'VISUAL_PLAN_SCENE_VISION_LOCK_LINEAGE_MISMATCH'
        using errcode = '23514',
              detail = 'Scene Direction must inherit the exact Vision Lock bound to its parent Visual Plan.';
    end if;
  end if;

  if current_world_id is null or current_world_id <> new.world_report_id then
    raise exception 'VISUAL_PLAN_WORLD_NOT_CURRENT'
      using errcode = '23514',
            detail = 'Visual Plan must reference the project''s current World revision.';
  end if;

  if not exists (
    select 1 from public.world_reports wr
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
    select 1 from public.songs s
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

create or replace function public.approve_visual_plan(p_plan_id uuid)
returns public.visual_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_plan public.visual_plans;
  updated_plan public.visual_plans;
begin
  select vp.*
    into target_plan
    from public.visual_plans vp
   where vp.id = p_plan_id
     and exists (
       select 1
         from public.projects p
        where p.id = vp.project_id
          and p.owner_id = (select auth.uid())
     )
   for update;

  if target_plan.id is null then
    raise exception 'VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN'
      using errcode = '42501';
  end if;

  if target_plan.status <> 'draft' then
    raise exception 'VISUAL_PLAN_ALREADY_LOCKED'
      using errcode = '55000',
            detail = 'The Visual Plan is already immutable.';
  end if;

  if target_plan.vision_lock_id is null then
    raise exception 'VISUAL_PLAN_VISION_LOCK_REQUIRED'
      using errcode = '23514',
            detail = 'Create and confirm the immutable Vision Lock before approving Scene Direction.';
  end if;

  if not exists (
    select 1
      from public.vision_locks vl
     where vl.id = target_plan.vision_lock_id
       and vl.project_id = target_plan.project_id
       and vl.world_report_id = target_plan.world_report_id
       and vl.style_bible_id = target_plan.style_bible_id
       and vl.song_id = target_plan.song_id
  ) then
    raise exception 'VISUAL_PLAN_VISION_LOCK_LINEAGE_MISMATCH'
      using errcode = '23514',
            detail = 'The Visual Plan Vision Lock does not match the plan lineage.';
  end if;

  if not exists (
    select 1
      from public.visual_plan_scenes s
     where s.visual_plan_id = target_plan.id
  ) then
    raise exception 'VISUAL_PLAN_NO_SCENES'
      using errcode = '23514',
            detail = 'A Visual Plan must contain at least one scene before approval.';
  end if;

  update public.visual_plan_scenes
     set status = 'approved'
   where visual_plan_id = target_plan.id
     and status = 'draft';

  update public.visual_plans
     set status = 'approved',
         locked_at = now()
   where id = target_plan.id
     and status = 'draft'
   returning * into updated_plan;

  if updated_plan.id is null then
    raise exception 'VISUAL_PLAN_LOCK_CONFLICT'
      using errcode = '40001',
            detail = 'The Visual Plan changed while it was being locked. Reload and try again.';
  end if;

  return updated_plan;
end;
$$;

revoke all on function public.approve_visual_plan(uuid) from public;
grant execute on function public.approve_visual_plan(uuid) to authenticated;

