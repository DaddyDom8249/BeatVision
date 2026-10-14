create or replace function public.enforce_motion_clip_asset_lineage()
returns trigger language plpgsql set search_path=public as $$
declare
plan_project_id uuid; scene_project_id uuid; scene_plan_id uuid;
job_project_id uuid; job_scene_id uuid; job_type text; job_status text;
image_project_id uuid; image_scene_id uuid;
begin
select project_id into plan_project_id from public.visual_plans where id=new.visual_plan_id;
select project_id,visual_plan_id into scene_project_id,scene_plan_id from public.visual_plan_scenes where id=new.scene_id;
select project_id,visual_plan_scene_id,job_type,status into job_project_id,job_scene_id,job_type,job_status from public.generation_jobs where id=new.generation_job_id;
if new.scene_image_id is not null then
select project_id,scene_id into image_project_id,image_scene_id from public.scene_image_assets where id=new.scene_image_id;
end if;
if plan_project_id is null or scene_project_id is null or job_project_id is null
or plan_project_id<>new.project_id or scene_project_id<>new.project_id or job_project_id<>new.project_id
or scene_plan_id<>new.visual_plan_id or job_scene_id<>new.scene_id
or job_type<>'scene_motion' or job_status not in ('processing','completed')
or (new.scene_image_id is not null and (image_project_id<>new.project_id or image_scene_id<>new.scene_id)) then
raise exception 'MOTION_CLIP_ASSET_LINEAGE_INVALID' using errcode='23514';
end if;
return new;
end;
$$;
drop trigger if exists motion_clip_assets_lineage on public.motion_clip_assets;
create trigger motion_clip_assets_lineage before insert or update on public.motion_clip_assets for each row execute function public.enforce_motion_clip_asset_lineage();
create or replace function public.set_motion_clip_assets_updated_at()
returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists motion_clip_assets_updated_at on public.motion_clip_assets;
create trigger motion_clip_assets_updated_at before update on public.motion_clip_assets for each row execute function public.set_motion_clip_assets_updated_at();
drop policy if exists motion_clip_assets_owner_select on public.motion_clip_assets;
create policy motion_clip_assets_owner_select on public.motion_clip_assets for select to authenticated
using (exists(select 1 from public.projects p where p.id=motion_clip_assets.project_id and p.owner_id=auth.uid()));
