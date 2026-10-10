create or replace function public.enforce_scene_image_asset_lineage()
returns trigger language plpgsql set search_path=public as $$
declare
plan_project_id uuid; scene_project_id uuid; scene_plan_id uuid;
job_project_id uuid; job_scene_id uuid; job_status text;
begin
select project_id into plan_project_id from public.visual_plans where id=new.visual_plan_id;
select project_id,visual_plan_id into scene_project_id,scene_plan_id from public.visual_plan_scenes where id=new.scene_id;
select project_id,visual_plan_scene_id,status into job_project_id,job_scene_id,job_status from public.generation_jobs where id=new.generation_job_id;
if plan_project_id is null or scene_project_id is null or job_project_id is null
or plan_project_id<>new.project_id or scene_project_id<>new.project_id or job_project_id<>new.project_id
or scene_plan_id<>new.visual_plan_id or job_scene_id<>new.scene_id
or job_status not in ('processing','completed') then
raise exception 'SCENE_IMAGE_ASSET_LINEAGE_INVALID' using errcode='23514';
end if;
return new;
end;
$$;
drop trigger if exists scene_image_assets_lineage on public.scene_image_assets;
create trigger scene_image_assets_lineage before insert or update on public.scene_image_assets for each row execute function public.enforce_scene_image_asset_lineage();
create or replace function public.set_scene_image_assets_updated_at()
returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists scene_image_assets_updated_at on public.scene_image_assets;
create trigger scene_image_assets_updated_at before update on public.scene_image_assets for each row execute function public.set_scene_image_assets_updated_at();
drop policy if exists scene_image_assets_owner_select on public.scene_image_assets;
create policy scene_image_assets_owner_select on public.scene_image_assets for select to authenticated
using (exists(select 1 from public.projects p where p.id=scene_image_assets.project_id and p.owner_id=auth.uid()));
