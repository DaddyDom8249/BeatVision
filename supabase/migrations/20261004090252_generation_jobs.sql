-- BeatVision 1: provider-neutral Generation Job contract.
-- Jobs snapshot only approved Vision Lock + approved Scene Direction.
-- Provider integrations must consume this contract and may not mutate creative authority.

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  vision_lock_id uuid not null references public.vision_locks(id) on delete restrict,
  visual_plan_id uuid not null references public.visual_plans(id) on delete restrict,
  visual_plan_scene_id uuid references public.visual_plan_scenes(id) on delete restrict,
  job_type text not null check (job_type in ('scene_image','scene_motion','assembly')),
  status text not null default 'queued'
    check (status in ('queued','submitted','processing','completed','failed')),
  provider text,
  provider_job_id text,
  idempotency_key text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  queued_at timestamptz not null default now(),
  submitted_at timestamptz,
  processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_jobs_idempotency_unique unique (idempotency_key),
  constraint generation_jobs_provider_pair check (
    (provider is null and provider_job_id is null)
    or (provider is not null and provider_job_id is not null)
  ),
  constraint generation_jobs_scene_type check (
    (job_type = 'assembly' and visual_plan_scene_id is null)
    or (job_type <> 'assembly' and visual_plan_scene_id is not null)
  )
);

create index if not exists generation_jobs_project_status_idx
  on public.generation_jobs(project_id, status, created_at);

create index if not exists generation_jobs_queue_idx
  on public.generation_jobs(status, queued_at);

create index if not exists generation_jobs_provider_idx
  on public.generation_jobs(provider, provider_job_id)
  where provider_job_id is not null;

create or replace function public.set_generation_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists generation_jobs_updated_at on public.generation_jobs;
create trigger generation_jobs_updated_at
before update on public.generation_jobs
for each row execute function public.set_generation_job_updated_at();

create or replace function public.enforce_generation_job_contract()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  lock_project_id uuid;
  plan_project_id uuid;
  plan_lock_id uuid;
  scene_project_id uuid;
  scene_plan_id uuid;
  scene_status text;
begin
  select vl.project_id
    into lock_project_id
    from public.vision_locks vl
   where vl.id = new.vision_lock_id;

  select vp.project_id, vp.vision_lock_id
    into plan_project_id, plan_lock_id
    from public.visual_plans vp
   where vp.id = new.visual_plan_id;

  if lock_project_id is null
     or plan_project_id is null
     or new.project_id <> lock_project_id
     or new.project_id <> plan_project_id
     or plan_lock_id <> new.vision_lock_id then
    raise exception 'GENERATION_JOB_LINEAGE_MISMATCH'
      using errcode = '23514',
            detail = 'Generation Job must use one project and the exact Vision Lock bound to its Visual Plan.';
  end if;

  if new.status <> 'queued' and (new.provider is null or new.provider_job_id is null)
     and new.status <> 'failed' then
    raise exception 'GENERATION_JOB_PROVIDER_REQUIRED'
      using errcode = '23514',
            detail = 'Submitted or processing jobs require provider and provider_job_id.';
  end if;

  if new.visual_plan_scene_id is not null then
    select s.project_id, s.visual_plan_id, s.status
      into scene_project_id, scene_plan_id, scene_status
      from public.visual_plan_scenes s
     where s.id = new.visual_plan_scene_id;

    if scene_project_id is null
       or scene_project_id <> new.project_id
       or scene_plan_id <> new.visual_plan_id
       or scene_status <> 'approved' then
      raise exception 'GENERATION_JOB_SCENE_NOT_APPROVED'
        using errcode = '23514',
              detail = 'Generation Jobs may only consume approved Scene Direction.';
    end if;
  end if;

  if new.job_type = 'assembly' and new.visual_plan_scene_id is not null then
    raise exception 'GENERATION_JOB_ASSEMBLY_SCENE_INVALID'
      using errcode = '23514';
  end if;

  if new.status = 'submitted' and old.status not in ('queued','submitted') then
    raise exception 'GENERATION_JOB_INVALID_TRANSITION'
      using errcode = '23514',
            detail = 'Allowed state transition: queued -> submitted.';
  end if;

  if new.status = 'processing' and old.status not in ('submitted','processing') then
    raise exception 'GENERATION_JOB_INVALID_TRANSITION'
      using errcode = '23514',
            detail = 'Allowed state transition: submitted -> processing.';
  end if;

  if new.status = 'completed' and old.status <> 'processing' then
    raise exception 'GENERATION_JOB_INVALID_TRANSITION'
      using errcode = '23514',
            detail = 'Allowed state transition: processing -> completed.';
  end if;

  if new.status = 'failed' and old.status not in ('queued','submitted','processing') then
    raise exception 'GENERATION_JOB_INVALID_TRANSITION'
      using errcode = '23514',
            detail = 'A job may fail only from queued, submitted, or processing.';
  end if;

  if old.status = 'completed' and new.status <> 'completed' then
    raise exception 'GENERATION_JOB_IMMUTABLE_COMPLETION'
      using errcode = '55000';
  end if;

  if old.status = 'failed' and new.status <> 'failed' then
    raise exception 'GENERATION_JOB_IMMUTABLE_FAILURE'
      using errcode = '55000';
  end if;

  if new.status = 'submitted' and new.submitted_at is null then new.submitted_at = now(); end if;
  if new.status = 'processing' and new.processing_at is null then new.processing_at = now(); end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at = now(); end if;
  if new.status = 'failed' and new.failed_at is null then new.failed_at = now(); end if;

  return new;
end;
$$;

drop trigger if exists generation_jobs_contract on public.generation_jobs;
create trigger generation_jobs_contract
before insert or update on public.generation_jobs
for each row execute function public.enforce_generation_job_contract();

create or replace function public.enqueue_scene_generation(
  p_project_id uuid,
  p_scene_id uuid,
  p_job_type text default 'scene_image'
)
returns public.generation_jobs
language plpgsql
security invoker
set search_path = public
as $$
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
$$;

revoke all on function public.enqueue_scene_generation(uuid, uuid, text) from public;
grant execute on function public.enqueue_scene_generation(uuid, uuid, text) to authenticated;

alter table public.generation_jobs enable row level security;

drop policy if exists generation_jobs_owner_select on public.generation_jobs;
create policy generation_jobs_owner_select
on public.generation_jobs
for select
to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = generation_jobs.project_id
      and p.owner_id = auth.uid()
  )
);

revoke insert, update, delete on public.generation_jobs from authenticated;

