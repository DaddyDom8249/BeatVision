-- Hardening 2026-10-14 (additive, apply by hand; see docs/hardening-2026-10-14.md).
-- Generated scene images and motion clips are creative evidence: once a row
-- exists its media/lineage columns can never be rewritten (not even by the
-- service role). No generated asset row (approved or candidate) may be
-- removed while its owning project exists: preserving take history avoids
-- status-demotion -> deletion and protects all previously approved takes.
-- Project cascade deletion is still allowed once the parent row is gone.
-- Status/approval transitions remain supported by existing approval/rejection
-- and explicit creator take-swap RPCs.
create or replace function public.prevent_generated_asset_media_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  k text;
  media_keys constant text[] := array['project_id','visual_plan_id','scene_id','generation_job_id',
    'scene_image_id','provider','model','image_url','video_url','storage_path'];
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.projects p where p.id = old.project_id) then
      raise exception 'GENERATED_ASSET_DELETE_FORBIDDEN' using errcode = '23514';
    end if;
    return old;
  end if;
  foreach k in array media_keys loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'GENERATED_ASSET_MEDIA_IMMUTABLE: %', k using errcode = '23514';
    end if;
  end loop;
  return new;
end; $$;

drop trigger if exists scene_image_assets_media_immutable on public.scene_image_assets;
create trigger scene_image_assets_media_immutable before update or delete on public.scene_image_assets
  for each row execute function public.prevent_generated_asset_media_mutation();
drop trigger if exists motion_clip_assets_media_immutable on public.motion_clip_assets;
create trigger motion_clip_assets_media_immutable before update or delete on public.motion_clip_assets
  for each row execute function public.prevent_generated_asset_media_mutation();
revoke all on function public.prevent_generated_asset_media_mutation() from public, anon, authenticated;

-- TRUNCATE invokes no row-level DELETE triggers. This privilege is not
-- required for generation, approval, retries or project cascades.
-- Privileged database owners / superusers retain inherent DDL authority;
-- this closes the application-service-role bypass, not trusted DBA access.
revoke truncate on public.scene_image_assets, public.motion_clip_assets
  from public, anon, authenticated, service_role;


-- Pre-existing compatibility defect exposed by the real PostgreSQL cascade
-- regression: a project DELETE cascades to its confirmed World revisions, but
-- their BEFORE DELETE trigger unconditionally rejects those child deletions.
-- Retain the existing confirmed-World immutability message and UPDATE guard.
-- A direct World DELETE still fails while its parent project exists.
create or replace function public.prevent_confirmed_world_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.projects p where p.id = old.project_id
  ) then
    return old;
  end if;

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


-- Cascade compatibility: Vision Locks, approved Visual Plans and their
-- approved scenes are otherwise blocked by independent legacy DELETE triggers.
-- They remain immutable while their owning project exists.
create or replace function public.prevent_vision_lock_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;
  raise exception 'VISION_LOCK_IMMUTABLE'
    using errcode = '55000', detail = 'Vision Locks are immutable. Create a new revision instead.';
end;
$$;

create or replace function public.prevent_approved_visual_plan_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;
  if old.status = 'approved' then
    raise exception 'VISUAL_PLAN_IMMUTABLE'
      using errcode = '55000', detail = 'Approved Visual Plans are immutable; create a new plan instead.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.prevent_approved_visual_plan_scene_mutation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;
  if old.status = 'approved' then
    raise exception using errcode='55000',
      message='Approved Visual Plan scenes are immutable. Create a new Visual Plan revision instead.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
