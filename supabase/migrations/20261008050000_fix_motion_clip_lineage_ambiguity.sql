-- Fix ambiguous generation_jobs.job_type reference in motion clip lineage trigger.
create or replace function public.enforce_motion_clip_asset_lineage()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  plan_project_id uuid;
  scene_project_id uuid;
  scene_plan_id uuid;
  job_project_id uuid;
  job_scene_id uuid;
  motion_job_type text;
  job_status text;
  image_project_id uuid;
  image_scene_id uuid;
begin
  select vp.project_id
    into plan_project_id
    from public.visual_plans vp
   where vp.id = new.visual_plan_id;

  select s.project_id, s.visual_plan_id
    into scene_project_id, scene_plan_id
    from public.visual_plan_scenes s
   where s.id = new.scene_id;

  select g.project_id, g.visual_plan_scene_id, g.job_type, g.status
    into job_project_id, job_scene_id, motion_job_type, job_status
    from public.generation_jobs g
   where g.id = new.generation_job_id;

  if new.scene_image_id is not null then
    select i.project_id, i.scene_id
      into image_project_id, image_scene_id
      from public.scene_image_assets i
     where i.id = new.scene_image_id;
  end if;

  if plan_project_id is null
     or scene_project_id is null
     or job_project_id is null
     or plan_project_id <> new.project_id
     or scene_project_id <> new.project_id
     or job_project_id <> new.project_id
     or scene_plan_id <> new.visual_plan_id
     or job_scene_id <> new.scene_id
     or motion_job_type <> 'scene_motion'
     or job_status not in ('processing','completed')
     or (new.scene_image_id is not null and (image_project_id <> new.project_id or image_scene_id <> new.scene_id))
  then
    raise exception 'MOTION_CLIP_ASSET_LINEAGE_INVALID' using errcode='23514';
  end if;

  return new;
end;
$function$;
