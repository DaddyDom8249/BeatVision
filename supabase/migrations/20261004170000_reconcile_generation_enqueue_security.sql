-- Reconcile the production generation enqueue boundary.
--
-- This migration preserves the live enqueue business logic and snapshot
-- contract while hardening the SECURITY DEFINER boundary. The database
-- unique constraint on generation_jobs.idempotency_key remains the physical
-- concurrency anchor; the exception handler converts a concurrent collision
-- into an idempotent read of the winning job.
--
-- Production target constraint verified read-only:
-- generation_jobs_idempotency_unique UNIQUE (idempotency_key).

begin;

create or replace function public.enqueue_scene_generation(
  p_project_id uuid,
  p_scene_id uuid,
  p_job_type text default 'scene_image'
)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  scene public.visual_plan_scenes;
  plan public.visual_plans;
  lock public.vision_locks;
  existing_job public.generation_jobs;
  created_job public.generation_jobs;
  key text;
begin
  -- SECURITY DEFINER bypasses caller RLS. Ownership therefore must be
  -- established explicitly inside the RPC before any target rows are read.
  if not exists (
    select 1
      from public.projects p
     where p.id = p_project_id
       and p.owner_id = auth.uid()
  ) then
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

  begin
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
  exception
    when unique_violation then
      -- A concurrent caller may win the UNIQUE(idempotency_key) race.
      -- Re-read the deterministic key. If no row exists, this was a
      -- different unique violation and must not be silently swallowed.
      select gj.*
        into existing_job
        from public.generation_jobs gj
       where gj.idempotency_key = key;

      if existing_job.id is null then
        raise;
      end if;

      return existing_job;
  end;
end;
$$;

-- Remove the default/public execution surface before granting the intended
-- authenticated-only boundary.
revoke all
  on function public.enqueue_scene_generation(uuid, uuid, text)
  from public;

revoke all
  on function public.enqueue_scene_generation(uuid, uuid, text)
  from anon;

grant execute
  on function public.enqueue_scene_generation(uuid, uuid, text)
  to authenticated;

-- Preserve the table boundary. Clients must use the validated RPC rather than
-- receiving direct write access to generation_jobs.
revoke insert, update, delete
  on public.generation_jobs
  from anon, authenticated;

commit;
