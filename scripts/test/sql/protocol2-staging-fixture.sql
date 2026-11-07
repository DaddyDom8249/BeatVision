-- STAGING FIXTURE ONLY. Never put this file in production migrations.
-- Operator installs only in a dedicated database after the application schema
-- and permanent admission migration. It does not create/approve generation jobs.
create table private.protocol2_staging_environment(run_id uuid primary key);
create table private.protocol2_staging_jobs(job_id uuid primary key);
create table private.protocol2_staging_events(
  event_id uuid primary key,job_id uuid not null,phase text not null
    check(phase in ('spawn_attempt','model_start','completed')),
  call_id text not null check(call_id ~ '^fc-staging-[0-9a-f]{32}$'),
  worker_id text not null,created_at timestamptz not null default now()
);
alter table private.protocol2_staging_environment enable row level security;
alter table private.protocol2_staging_jobs enable row level security;
alter table private.protocol2_staging_events enable row level security;
revoke all on private.protocol2_staging_environment,private.protocol2_staging_jobs,
  private.protocol2_staging_events from public,anon,authenticated,service_role;

create function public.protocol2_staging_probe(p_run_id uuid,p_action text,p_job_id uuid default null,p_event jsonb default null)
returns jsonb language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from private.protocol2_staging_environment where run_id=p_run_id)
    or to_regclass('private.modal_motion_admissions') is null then
    raise exception 'STAGING_DATABASE_NOT_READY' using errcode='42501';
  end if;
  if p_action='ready' then
    return jsonb_build_object('run_id',p_run_id,'schema',2,'fake_only',true);
  end if;
  if not exists(select 1 from private.protocol2_staging_jobs where job_id=p_job_id) then
    raise exception 'STAGING_JOB_NOT_PREPARED' using errcode='42501';
  end if;
  if p_action='allowed' then return 'true'::jsonb; end if;
  if p_action='event' then
    if jsonb_typeof(p_event) is distinct from 'object'
      or coalesce(p_event->>'phase','') not in ('spawn_attempt','model_start','completed')
      or coalesce(p_event->>'worker_id','') !~ '^(local|modal)-[A-Za-z0-9_-]{1,100}$' then
      raise exception 'STAGING_EVENT_INVALID';
    end if;
    insert into private.protocol2_staging_events(event_id,job_id,phase,call_id,worker_id)
      values((p_event->>'event_id')::uuid,p_job_id,p_event->>'phase',p_event->>'call_id',p_event->>'worker_id');
    return 'true'::jsonb;
  end if;
  if p_action='summary' then
    return jsonb_build_object('spawn_attempts',(select count(*) from private.protocol2_staging_events where job_id=p_job_id and phase='spawn_attempt'),
      'fake_model_starts',(select count(*) from private.protocol2_staging_events where job_id=p_job_id and phase='model_start'),
      'fake_completions',(select count(*) from private.protocol2_staging_events where job_id=p_job_id and phase='completed'));
  end if;
  raise exception 'STAGING_OPERATION_INVALID';
end;
$$;
revoke all on function public.protocol2_staging_probe(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.protocol2_staging_probe(uuid,text,uuid,jsonb) to service_role;
