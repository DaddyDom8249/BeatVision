-- BeatVision assembly job contract.
-- Requires an approved Visual Plan, fully approved Scene Direction, and one approved
-- motion clip per scene before creating the idempotent assembly Generation Job.

create or replace function public.enqueue_assembly_generation(
  p_project_id uuid,
  p_visual_plan_id uuid
)
returns public.generation_jobs
language plpgsql
security invoker
set search_path = public
as $$
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
  select vp.* into plan
    from public.visual_plans vp
   where vp.id = p_visual_plan_id
     and vp.project_id = p_project_id
     and vp.status = 'approved';

  if plan.id is null or plan.vision_lock_id is null then
    raise exception 'VISUAL_PLAN_NOT_LOCKED' using errcode = '55000';
  end if;

  select vl.* into lock
    from public.vision_locks vl
   where vl.id = plan.vision_lock_id
     and vl.project_id = p_project_id;

  if lock.id is null then
    raise exception 'VISION_LOCK_LINEAGE_INVALID' using errcode = '23514';
  end if;

  select lock.snapshot->'song'->>'audio_path' into audio_path;
  if coalesce(trim(audio_path), '') = '' then
    raise exception 'ASSEMBLY_AUDIO_MISSING' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where s.status = 'approved')
    into scene_total, scene_approved
    from public.visual_plan_scenes s
   where s.project_id = p_project_id
     and s.visual_plan_id = plan.id;

  if scene_total = 0 or scene_approved <> scene_total then
    raise exception 'ASSEMBLY_SCENES_NOT_FULLY_APPROVED'
      using errcode = '55000',
            detail = format('approved=%s total=%s', scene_approved, scene_total);
  end if;

  -- Assembly must have exactly one approved motion asset for every
  -- approved scene. Counting rows alone is insufficient: duplicate approved
  -- clips could otherwise satisfy the total while leaving a scene uncovered.
  select count(*), count(distinct m.scene_id)
    into motion_approved, scene_approved
    from public.motion_clip_assets m
   where m.project_id = p_project_id
     and m.visual_plan_id = plan.id
     and m.status = 'approved'
     and m.approved = true;

  if motion_approved <> scene_total
     or scene_approved <> scene_total
     or exists (
       select 1
         from public.motion_clip_assets m
        where m.project_id = p_project_id
          and m.visual_plan_id = plan.id
          and m.status = 'approved'
          and m.approved = true
          and not exists (
            select 1
              from public.visual_plan_scenes s
             where s.id = m.scene_id
               and s.project_id = p_project_id
               and s.visual_plan_id = plan.id
          )
     )
  then
    raise exception 'ASSEMBLY_MOTION_NOT_FULLY_APPROVED'
      using errcode = '55000',
            detail = format('approved_motion=%s distinct_scenes=%s required=%s', motion_approved, scene_approved, scene_total);
  end if;

  -- A motion clip is not independently sufficient: its source image must
  -- still be the approved image for the same locked scene lineage.
  if exists (
    select 1
      from public.motion_clip_assets m
      join public.visual_plan_scenes s on s.id = m.scene_id
     where m.project_id = p_project_id
       and m.visual_plan_id = plan.id
       and m.status = 'approved'
       and m.approved = true
       and not exists (
         select 1
           from public.scene_image_assets i
          where i.id = m.scene_image_id
            and i.project_id = p_project_id
            and i.visual_plan_id = plan.id
            and i.scene_id = s.id
            and i.status = 'approved'
            and i.approved = true
       )
  ) then
    raise exception 'ASSEMBLY_MOTION_SOURCE_IMAGE_INVALID'
      using errcode = '55000';
  end if;

  key := concat('assembly:', plan.id::text, ':', lock.id::text);

  select gj.* into existing_job
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
    null,
    'assembly',
    key,
    jsonb_build_object(
      'schema_version', 1,
      'vision_lock_id', lock.id,
      'vision_revision', lock.revision_number,
      'visual_plan_id', plan.id,
      'audio_path', audio_path,
      'vision_snapshot', lock.snapshot,
      'plan', jsonb_build_object(
        'id', plan.id,
        'title', plan.title,
        'duration_seconds', plan.duration_seconds,
        'creative_thesis', plan.creative_thesis,
        'global_direction', plan.global_direction
      ),
      'scenes', (
        select coalesce(jsonb_agg(to_jsonb(s) order by s.scene_number), '[]'::jsonb)
          from public.visual_plan_scenes s
         where s.project_id = p_project_id
           and s.visual_plan_id = plan.id
      ),
      'motion_clips', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'asset_id', m.id,
            'scene', s.scene_number,
            'video_url', m.video_url,
            'provider', m.provider,
            'model', m.model,
            'generation_type', 'GENERATIVE_VIDEO',
            'requested_duration_seconds', s.end_time - s.start_time
          ) order by s.scene_number
        ), '[]'::jsonb)
          from public.motion_clip_assets m
          join public.visual_plan_scenes s on s.id = m.scene_id
         where m.project_id = p_project_id
           and m.visual_plan_id = plan.id
           and m.status = 'approved'
           and m.approved = true
      )
    )
  )
  returning * into created_job;

  return created_job;
end;
$$;