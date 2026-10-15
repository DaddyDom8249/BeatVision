-- Owner-only creator decisions; existing approvals remain immutable.
-- Reconcile the live secure asset approval migration into repository history.
-- The equivalent migration was applied live before history reconciliation; this
-- idempotent migration records the exact live contract under the resulting
-- Supabase migration version.

create or replace function public.approve_scene_image_asset(p_asset_id uuid)
returns public.scene_image_assets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  asset public.scene_image_assets;
  project_owner uuid;
begin
  select p.owner_id into project_owner
  from public.scene_image_assets a
  join public.projects p on p.id = a.project_id
  where a.id = p_asset_id;

  if project_owner is null or auth.uid() is null or project_owner <> auth.uid() then
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

  perform 1 from public.visual_plan_scenes where id=asset.scene_id for update;
  if exists(select 1 from public.scene_image_assets other
    where other.project_id=asset.project_id and other.visual_plan_id=asset.visual_plan_id
      and other.scene_id=asset.scene_id and other.approved=true and other.id<>asset.id) then
    raise exception 'SCENE_IMAGE_ALREADY_APPROVED_USE_PLAN_REVISION' using errcode='55000';
  end if;

  update public.scene_image_assets
     set status = 'approved', approved = true
   where id = p_asset_id
  returning * into asset;

  return asset;
end;
$$;

revoke execute on function public.approve_scene_image_asset(uuid) from public, anon;
grant execute on function public.approve_scene_image_asset(uuid) to authenticated;

create or replace function public.approve_motion_clip_asset(p_asset_id uuid)
returns public.motion_clip_assets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  asset public.motion_clip_assets;
  project_owner uuid;
begin
  select p.owner_id into project_owner
  from public.motion_clip_assets a
  join public.projects p on p.id = a.project_id
  where a.id = p_asset_id;

  if project_owner is null or auth.uid() is null or project_owner <> auth.uid() then
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

  perform 1 from public.visual_plan_scenes where id=asset.scene_id for update;
  if exists(select 1 from public.motion_clip_assets other
    where other.project_id=asset.project_id and other.visual_plan_id=asset.visual_plan_id
      and other.scene_id=asset.scene_id and other.approved=true and other.id<>asset.id) then
    raise exception 'MOTION_CLIP_ALREADY_APPROVED_USE_PLAN_REVISION' using errcode='55000';
  end if;

  update public.motion_clip_assets
     set status = 'approved', approved = true
   where id = p_asset_id
  returning * into asset;

  return asset;
end;
$$;

revoke execute on function public.approve_motion_clip_asset(uuid) from public, anon;
grant execute on function public.approve_motion_clip_asset(uuid) to authenticated;

create or replace function public.reject_scene_asset(p_asset_type text,p_asset_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare scene_key uuid; project_key uuid;
begin
 if p_asset_type='scene_image' then
  select scene_id,project_id into scene_key,project_key from public.scene_image_assets where id=p_asset_id and status='generated' and approved=false;
 elsif p_asset_type='scene_motion' then
  select scene_id,project_id into scene_key,project_key from public.motion_clip_assets where id=p_asset_id and status='generated' and approved=false;
 else raise exception 'ASSET_TYPE_INVALID' using errcode='22023'; end if;
 if project_key is null or not exists(select 1 from projects where id=project_key and owner_id=auth.uid()) then
  raise exception 'ASSET_NOT_REJECTABLE_OR_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from visual_plan_scenes where id=scene_key for update;
 if p_asset_type='scene_image' then
  update scene_image_assets set status='rejected' where id=p_asset_id and status='generated' and approved=false;
 else update motion_clip_assets set status='rejected' where id=p_asset_id and status='generated' and approved=false; end if;
 if not found then raise exception 'ASSET_DECISION_CONFLICT' using errcode='40001'; end if;
end; $$;
revoke all on function public.reject_scene_asset(text,uuid) from public,anon;
grant execute on function public.reject_scene_asset(text,uuid) to authenticated;

-- Keep generation_jobs client INSERT/UPDATE revoked and owner SELECT RLS intact.
-- Enqueue is a narrow privileged operation authorized by explicit project ownership.
CREATE OR REPLACE FUNCTION public.enqueue_scene_image_variant(p_project_id uuid, p_scene_id uuid, p_request_id uuid)
 RETURNS generation_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  scene public.visual_plan_scenes;
  plan public.visual_plans;
  lock public.vision_locks;
  existing_job public.generation_jobs;
  created_job public.generation_jobs;
  key text;
  p_job_type text := 'scene_image';
begin
  if p_request_id is null then raise exception 'GENERATION_REQUEST_ID_REQUIRED' using errcode='22023'; end if;

  -- Job writes remain server-only; authorize the caller before privileged reads.
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = (select auth.uid())
  ) then
    raise exception 'GENERATION_PROJECT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_job_type not in ('scene_image','scene_motion') then
    raise exception 'GENERATION_JOB_TYPE_INVALID' using errcode = '22023';
  end if;

  select s.*
    into scene
    from public.visual_plan_scenes s
   where s.id = p_scene_id
     and s.project_id = p_project_id
     and s.status = 'approved' for update;

  if scene.id is null then
    raise exception 'SCENE_NOT_APPROVED_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select vp.*
    into plan
    from public.visual_plans vp
   where vp.id = scene.visual_plan_id
     and vp.project_id = p_project_id
     and vp.status = 'approved';

  if plan.id is null or plan.vision_lock_id is null then
    raise exception 'VISUAL_PLAN_NOT_LOCKED' using errcode = '55000';
  end if;

  select vl.*
    into lock
    from public.vision_locks vl
   where vl.id = plan.vision_lock_id
     and vl.project_id = p_project_id
     and vl.world_report_id = scene.world_report_id
     and vl.style_bible_id = scene.style_bible_id
     and vl.song_id = scene.song_id;

  if lock.id is null then
    raise exception 'VISION_LOCK_LINEAGE_INVALID' using errcode = '23514';
  end if;

  key := concat(p_job_type, ':', p_scene_id::text, ':', lock.id::text, ':variant:', p_request_id::text);

  select gj.*
    into existing_job
    from public.generation_jobs gj
   where gj.idempotency_key = key;

  if existing_job.id is not null then
    return existing_job;
  end if;

  select gj.* into existing_job from public.generation_jobs gj
    where gj.project_id=p_project_id and gj.visual_plan_scene_id=p_scene_id
      and gj.job_type='scene_image' and gj.status in ('queued','submitted','processing')
    order by gj.created_at desc limit 1;
  if existing_job.id is not null then return existing_job; end if;

  insert into public.generation_jobs (
    project_id,
    vision_lock_id,
    visual_plan_id,
    visual_plan_scene_id,
    job_type,
    idempotency_key,
    input_snapshot
  )
  values (
    p_project_id,
    lock.id,
    plan.id,
    scene.id,
    p_job_type,
    key,
    jsonb_build_object(
      'schema_version', 1,
      'vision_lock_id', lock.id,
      'vision_revision', lock.revision_number,
      'visual_plan_id', plan.id,
      'visual_plan_scene_id', scene.id,
      'scene', to_jsonb(scene),
      'plan', jsonb_build_object(
        'id', plan.id,
        'title', plan.title,
        'duration_seconds', plan.duration_seconds,
        'creative_thesis', plan.creative_thesis,
        'global_direction', plan.global_direction
      ),
      'vision_snapshot', lock.snapshot
    )
  )
  returning * into created_job;

  return created_job;
end;
$function$
;
