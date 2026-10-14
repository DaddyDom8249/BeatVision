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
