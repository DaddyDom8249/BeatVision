CREATE OR REPLACE FUNCTION public.enqueue_scene_generation(p_project_id uuid, p_scene_id uuid, p_job_type text DEFAULT 'scene_image'::text)
 RETURNS generation_jobs
 LANGUAGE plpgsql
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
;
CREATE OR REPLACE FUNCTION public.enqueue_assembly_generation(p_project_id uuid, p_visual_plan_id uuid)
 RETURNS generation_jobs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  plan public.visual_plans;
  lock public.vision_locks;
  existing_job public.generation_jobs;
  created_job public.generation_jobs;
  scene_total integer;
  scene_approved integer;
  motion_approved integer;
  audio_path text;
  key text;
begin
  select vp.* into plan from public.visual_plans vp
   where vp.id=p_visual_plan_id and vp.project_id=p_project_id and vp.status='approved';
  if plan.id is null or plan.vision_lock_id is null then raise exception 'VISUAL_PLAN_NOT_LOCKED' using errcode='55000'; end if;
  select vl.* into lock from public.vision_locks vl where vl.id=plan.vision_lock_id and vl.project_id=p_project_id;
  if lock.id is null then raise exception 'VISION_LOCK_LINEAGE_INVALID' using errcode='23514'; end if;
  select lock.snapshot->'song'->>'audio_path' into audio_path;
  if coalesce(trim(audio_path),'')='' then raise exception 'ASSEMBLY_AUDIO_MISSING' using errcode='22023'; end if;
  select count(*),count(*) filter(where s.status='approved') into scene_total,scene_approved
    from public.visual_plan_scenes s where s.project_id=p_project_id and s.visual_plan_id=plan.id;
  if scene_total=0 or scene_approved<>scene_total then raise exception 'ASSEMBLY_SCENES_NOT_FULLY_APPROVED' using errcode='55000',detail=format('approved=%s total=%s',scene_approved,scene_total); end if;
  select count(*),count(distinct m.scene_id) into motion_approved,scene_approved
    from public.motion_clip_assets m where m.project_id=p_project_id and m.visual_plan_id=plan.id and m.status='approved' and m.approved=true;
  if motion_approved<>scene_total or scene_approved<>scene_total or exists(
    select 1 from public.motion_clip_assets m where m.project_id=p_project_id and m.visual_plan_id=plan.id and m.status='approved' and m.approved=true
    and not exists(select 1 from public.visual_plan_scenes s where s.id=m.scene_id and s.project_id=p_project_id and s.visual_plan_id=plan.id)
  ) then raise exception 'ASSEMBLY_MOTION_NOT_FULLY_APPROVED' using errcode='55000',detail=format('approved_motion=%s distinct_scenes=%s required=%s',motion_approved,scene_approved,scene_total); end if;
  if exists(
    select 1 from public.motion_clip_assets m join public.visual_plan_scenes s on s.id=m.scene_id
    where m.project_id=p_project_id and m.visual_plan_id=plan.id and m.status='approved' and m.approved=true
    and not exists(select 1 from public.scene_image_assets i where i.id=m.scene_image_id and i.project_id=p_project_id and i.visual_plan_id=plan.id and i.scene_id=s.id and i.status='approved' and i.approved=true)
  ) then raise exception 'ASSEMBLY_MOTION_SOURCE_IMAGE_INVALID' using errcode='55000'; end if;
  key:=concat('assembly:',plan.id::text,':',lock.id::text);
  select gj.* into existing_job from public.generation_jobs gj where gj.idempotency_key=key;
  if existing_job.id is not null then return existing_job; end if;
  insert into public.generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,idempotency_key,input_snapshot)
  values(p_project_id,lock.id,plan.id,null,'assembly',key,jsonb_build_object(
    'schema_version',1,'vision_lock_id',lock.id,'vision_revision',lock.revision_number,'visual_plan_id',plan.id,'audio_path',audio_path,'vision_snapshot',lock.snapshot,
    'plan',jsonb_build_object('id',plan.id,'title',plan.title,'duration_seconds',plan.duration_seconds,'creative_thesis',plan.creative_thesis,'global_direction',plan.global_direction),
    'scenes',(select coalesce(jsonb_agg(to_jsonb(s) order by s.scene_number),'[]'::jsonb) from public.visual_plan_scenes s where s.project_id=p_project_id and s.visual_plan_id=plan.id),
    'motion_clips',(select coalesce(jsonb_agg(jsonb_build_object('asset_id',m.id,'scene',s.scene_number,'video_url',m.video_url,'provider',m.provider,'model',m.model,'generation_type','GENERATIVE_VIDEO','requested_duration_seconds',s.end_time-s.start_time) order by s.scene_number),'[]'::jsonb)
      from public.motion_clip_assets m join public.visual_plan_scenes s on s.id=m.scene_id
      where m.project_id=p_project_id and m.visual_plan_id=plan.id and m.status='approved' and m.approved=true)
  )) returning * into created_job;
  return created_job;
end;
$function$
;
revoke all on function public.enqueue_scene_generation(uuid,uuid,text) from public;
revoke all on function public.enqueue_assembly_generation(uuid,uuid) from public;
grant execute on function public.enqueue_scene_generation(uuid,uuid,text) to authenticated,service_role;
grant execute on function public.enqueue_assembly_generation(uuid,uuid) to authenticated,service_role;
