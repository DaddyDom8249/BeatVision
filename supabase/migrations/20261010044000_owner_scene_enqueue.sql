CREATE OR REPLACE FUNCTION public.enqueue_scene_generation(p_project_id uuid, p_scene_id uuid, p_job_type text DEFAULT 'scene_image'::text)
 RETURNS generation_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  scene public.visual_plan_scenes;
  plan public.visual_plans;
  lock public.vision_locks;
  existing_job public.generation_jobs;
  created_job public.generation_jobs;
  key text;
begin
  if auth.uid() is null or not exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid()) then
    raise exception 'PROJECT_FORBIDDEN' using errcode = '42501';
  end if;

  if p_job_type not in ('scene_image','scene_motion') then
    raise exception 'GENERATION_JOB_TYPE_INVALID' using errcode = '22023';
  end if;

  select s.*
    into scene
    from public.visual_plan_scenes s
   where s.id = p_scene_id
     and s.project_id = p_project_id
     and s.status = 'approved';

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

  key := concat(p_job_type, ':', p_scene_id::text, ':', lock.id::text);

  select gj.*
    into existing_job
    from public.generation_jobs gj
   where gj.idempotency_key = key;

  if existing_job.id is not null then
    return existing_job;
  end if;

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

REVOKE ALL ON FUNCTION public.enqueue_scene_generation(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_scene_generation(uuid,uuid,text) TO authenticated;
