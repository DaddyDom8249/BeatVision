-- Secure approval RPCs for generated scene assets.
-- Client tables intentionally remain read-only for authenticated users; approval
-- is an explicit, owner-checked transition with generation/lineage validation.

create or replace function public.approve_scene_image_asset(p_asset_id uuid)
returns public.scene_image_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  asset public.scene_image_assets;
  project_owner uuid;
begin
  select p.owner_id into project_owner
  from public.scene_image_assets a
  join public.projects p on p.id = a.project_id
  where a.id = p_asset_id;

  if project_owner is null or project_owner <> auth.uid() then
    raise exception 'SCENE_IMAGE_ASSET_NOT_FOUND' using errcode = '42501';
  end if;

  select a.* into asset
  from public.scene_image_assets a
  join public.generation_jobs g on g.id = a.generation_job_id
  where a.id = p_asset_id
    and a.status = 'generated'
    and a.approved = false
    and g.project_id = a.project_id
    and g.visual_plan_id = a.visual_plan_id
    and g.visual_plan_scene_id = a.scene_id
    and g.job_type = 'scene_image'
    and g.status = 'completed'
    and trim(a.image_url) <> ''
    and a.image_url ~* '^https?://';

  if asset.id is null then
    raise exception 'SCENE_IMAGE_ASSET_NOT_APPROVABLE' using errcode = '55000';
  end if;

  update public.scene_image_assets
     set status = 'approved', approved = true
   where id = p_asset_id
  returning * into asset;

  return asset;
end;
$$;

revoke all on function public.approve_scene_image_asset(uuid) from public;
grant execute on function public.approve_scene_image_asset(uuid) to authenticated;

create or replace function public.approve_motion_clip_asset(p_asset_id uuid)
returns public.motion_clip_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  asset public.motion_clip_assets;
  project_owner uuid;
begin
  select p.owner_id into project_owner
  from public.motion_clip_assets a
  join public.projects p on p.id = a.project_id
  where a.id = p_asset_id;

  if project_owner is null or project_owner <> auth.uid() then
    raise exception 'MOTION_CLIP_ASSET_NOT_FOUND' using errcode = '42501';
  end if;

  select m.* into asset
  from public.motion_clip_assets m
  join public.generation_jobs g on g.id = m.generation_job_id
  join public.scene_image_assets i on i.id = m.scene_image_id
   and i.project_id = m.project_id
   and i.visual_plan_id = m.visual_plan_id
   and i.scene_id = m.scene_id
   and i.status = 'approved'
   and i.approved = true
  where m.id = p_asset_id
    and m.status = 'generated'
    and m.approved = false
    and g.project_id = m.project_id
    and g.visual_plan_id = m.visual_plan_id
    and g.visual_plan_scene_id = m.scene_id
    and g.job_type = 'scene_motion'
    and g.status = 'completed'
    and trim(m.video_url) <> ''
    and m.video_url ~* '^https?://';

  if asset.id is null then
    raise exception 'MOTION_CLIP_ASSET_NOT_APPROVABLE' using errcode = '55000';
  end if;

  update public.motion_clip_assets
     set status = 'approved', approved = true
   where id = p_asset_id
  returning * into asset;

  return asset;
end;
$$;

revoke all on function public.approve_motion_clip_asset(uuid) from public;
grant execute on function public.approve_motion_clip_asset(uuid) to authenticated;
