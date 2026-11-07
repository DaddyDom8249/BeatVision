-- Permanent admission tombstones. Deliberately no cascading project/job FK:
-- deleting creative data must never recreate permission to execute its old ID.
create schema if not exists private;
create table private.modal_motion_admissions (
  generation_job_id uuid primary key,
  project_id uuid not null,
  owner_id uuid not null,
  scene_id uuid not null,
  source_image_id uuid,
  reservation jsonb not null,
  execution jsonb,
  provider_call_id text unique check(provider_call_id ~ '^fc-[A-Za-z0-9_-]+$'),
  legacy_hold boolean not null default false,
  created_at timestamptz not null default now()
);
alter table private.modal_motion_admissions enable row level security;
revoke all on private.modal_motion_admissions from public, anon, authenticated, service_role;

-- Old Dict absence proves nothing. Preserve every known old Modal job as a
-- non-reclaimable hold, including queued jobs and already completed executions.
insert into private.modal_motion_admissions(generation_job_id,project_id,owner_id,scene_id,source_image_id,reservation,legacy_hold)
select j.id,j.project_id,p.owner_id,j.visual_plan_scene_id,
  case when j.input_snapshot->'modal_motion'->>'source_image_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (j.input_snapshot->'modal_motion'->>'source_image_id')::uuid end,
  jsonb_strip_nulls(jsonb_build_object('state','receipt_unknown','legacy_hold',true,
    'job_id',case when j.output->>'upstream_job_id' ~ '^fc-[A-Za-z0-9_-]+$' then j.output->>'upstream_job_id' end)),true
from public.generation_jobs j join public.projects p on p.id=j.project_id
where j.job_type='scene_motion' and j.input_snapshot ? 'modal_motion';

create function public.modal_motion_admission(p_job_id uuid,p_operation text,p_record jsonb default null,p_execution boolean default false)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  current_row private.modal_motion_admissions;
  job public.generation_jobs;
  project_owner uuid;
  request jsonb;
  stored_request jsonb;
  changed integer;
begin
  if p_operation is null or p_execution is null or p_operation not in ('lookup','reserve','receipt','begin') then
    raise exception 'MODAL_LEDGER_OPERATION_INVALID' using errcode='22023';
  end if;
  if p_operation='lookup' then
    select * into current_row from private.modal_motion_admissions where generation_job_id=p_job_id;
    if not found then return null; end if;
    return case when p_execution then current_row.execution else current_row.reservation end;
  end if;
  if jsonb_typeof(p_record) is distinct from 'object' or coalesce(p_record->>'fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_record->>'admission_token','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'MODAL_LEDGER_RECORD_INVALID' using errcode='22023';
  end if;
  -- Serialize on the actual job, including first-insert contenders. A deleted
  -- job can retain a receipt, but cannot grant another spawn or model entry.
  if p_operation in ('reserve','begin') then
    select * into job from public.generation_jobs where id=p_job_id for update;
    if not found then raise exception 'MODAL_ADMISSION_JOB_UNAVAILABLE' using errcode='42501'; end if;
  end if;
  select * into current_row from private.modal_motion_admissions where generation_job_id=p_job_id for update;

  if p_operation='reserve' then
    request=p_record->'request';
    if p_execution or jsonb_typeof(request) is distinct from 'object' or (request->>'generation_job_id')::uuid is distinct from p_job_id
       or (request->>'project_id')::uuid is distinct from job.project_id
       or (request->>'scene_id')::uuid is distinct from job.visual_plan_scene_id
       or (request->>'source_image_id')::uuid is distinct from (job.input_snapshot->'modal_motion'->>'source_image_id')::uuid then
      raise exception 'MODAL_ADMISSION_LINEAGE_INVALID' using errcode='42501';
    end if;
    if current_row.generation_job_id is not null then
      if current_row.project_id is distinct from job.project_id or current_row.scene_id is distinct from job.visual_plan_scene_id
         or not exists(select 1 from public.projects where id=current_row.project_id and owner_id=current_row.owner_id) then
        raise exception 'MODAL_ADMISSION_LINEAGE_INVALID' using errcode='42501';
      end if;
      if not current_row.legacy_hold and
         (current_row.reservation->>'fingerprint'<>p_record->>'fingerprint' or current_row.reservation->'request'<>request) then
        raise exception 'MODAL_REQUEST_FINGERPRINT_CONFLICT' using errcode='23514';
      end if;
      return 'false'::jsonb; -- NEVER regrant, even when the original reply was lost.
    end if;
    select owner_id into project_owner from public.projects where id=job.project_id;
    if project_owner is null then raise exception 'MODAL_ADMISSION_PROJECT_UNAVAILABLE' using errcode='42501'; end if;
    if job.input_snapshot->'modal_motion'->>'admission_protocol' is distinct from '2' then
      insert into private.modal_motion_admissions(generation_job_id,project_id,owner_id,scene_id,source_image_id,reservation,legacy_hold)
        values(p_job_id,job.project_id,project_owner,job.visual_plan_scene_id,
        (request->>'source_image_id')::uuid,'{"state":"receipt_unknown","legacy_hold":true}',true);
      return 'false'::jsonb;
    end if;
    if job.job_type<>'scene_motion' or job.status<>'processing'
       or request->>'admission_protocol' is distinct from '2'
       or job.input_snapshot->'modal_motion'->>'model' is distinct from 'Lightricks/LTX-Video-0.9.5'
       or job.input_snapshot->'modal_motion'->>'revision' is distinct from 'e58e28c39631af4d1468ee57a853764e11c1d37e'
       or request is distinct from job.output->'modal_dispatch_payload'
       or job.output->>'modal_source_sha256' is distinct from request->>'image_sha256'
       or job.output->'dispatch_intent'->>'request_id' is distinct from 'beatvision:'||job.id::text then
      raise exception 'MODAL_ADMISSION_SNAPSHOT_INVALID' using errcode='23514';
    end if;
    if not exists(select 1 from public.scene_image_assets i
      join public.visual_plan_scenes s on s.id=i.scene_id and s.visual_plan_id=i.visual_plan_id and s.project_id=i.project_id
      join public.visual_plans v on v.id=i.visual_plan_id and v.project_id=i.project_id
      where i.id=(request->>'source_image_id')::uuid and i.project_id=job.project_id
        and i.visual_plan_id=job.visual_plan_id and i.scene_id=job.visual_plan_scene_id
        and i.status='approved' and i.approved and s.status='approved' and v.status='approved'
        and v.vision_lock_id=job.vision_lock_id) then
      raise exception 'MODAL_ADMISSION_SOURCE_UNAPPROVED' using errcode='42501';
    end if;
    insert into private.modal_motion_admissions(generation_job_id,project_id,owner_id,scene_id,source_image_id,reservation)
      values(p_job_id,job.project_id,project_owner,job.visual_plan_scene_id,(request->>'source_image_id')::uuid,p_record);
    return 'true'::jsonb;
  end if;

  if current_row.generation_job_id is null or current_row.legacy_hold
     or current_row.reservation->>'fingerprint' is distinct from p_record->>'fingerprint'
     or current_row.reservation->>'admission_token' is distinct from p_record->>'admission_token'
     or coalesce(p_record->>'job_id','') !~ '^fc-[A-Za-z0-9_-]+$' then
    raise exception 'MODAL_ADMISSION_IDENTITY_INVALID' using errcode='23514';
  end if;
  if (current_row.reservation ? 'job_id' and current_row.reservation->>'job_id'<>p_record->>'job_id')
     or (current_row.execution is not null and current_row.execution->>'job_id'<>p_record->>'job_id') then
    raise exception 'MODAL_EXECUTION_RECEIPT_CONFLICT' using errcode='23514';
  end if;
  if exists(select 1 from private.modal_motion_admissions a where a.generation_job_id<>p_job_id
    and (a.reservation->>'job_id'=p_record->>'job_id' or a.execution->>'job_id'=p_record->>'job_id')) then
    raise exception 'MODAL_EXECUTION_RECEIPT_REPLAY' using errcode='23514';
  end if;
  if p_operation='begin' then
    if not p_execution or current_row.execution is not null then return 'false'::jsonb; end if;
    stored_request=current_row.reservation->'request';
    if job.status is distinct from 'processing' or job.project_id is distinct from current_row.project_id
       or job.job_type is distinct from 'scene_motion'
       or job.visual_plan_scene_id is distinct from current_row.scene_id
       or job.input_snapshot->'modal_motion'->>'source_image_id' is distinct from current_row.source_image_id::text
       or job.input_snapshot->'modal_motion'->>'admission_protocol' is distinct from '2'
       or job.input_snapshot->'modal_motion'->>'model' is distinct from 'Lightricks/LTX-Video-0.9.5'
       or job.input_snapshot->'modal_motion'->>'revision' is distinct from 'e58e28c39631af4d1468ee57a853764e11c1d37e'
       or job.output->>'modal_source_sha256' is distinct from stored_request->>'image_sha256'
       or job.output->'modal_dispatch_payload' is distinct from stored_request
       or not exists(select 1 from public.projects where id=current_row.project_id and owner_id=current_row.owner_id)
       or not exists(select 1 from public.scene_image_assets i
         join public.visual_plan_scenes s on s.id=i.scene_id and s.project_id=i.project_id and s.visual_plan_id=i.visual_plan_id
         join public.visual_plans v on v.id=i.visual_plan_id and v.project_id=i.project_id
         where i.id=current_row.source_image_id and i.project_id=current_row.project_id
           and i.scene_id=current_row.scene_id and i.visual_plan_id=job.visual_plan_id and i.status='approved' and i.approved
           and s.status='approved' and v.status='approved' and v.vision_lock_id=job.vision_lock_id) then
      raise exception 'MODAL_EXECUTION_AUTHORIZATION_INVALID' using errcode='42501';
    end if;
    update private.modal_motion_admissions set execution=p_record,provider_call_id=p_record->>'job_id'
      where generation_job_id=p_job_id and execution is null;
    get diagnostics changed=row_count;
    return to_jsonb(changed=1);
  end if;
  if p_execution then raise exception 'MODAL_LEDGER_OPERATION_INVALID' using errcode='22023'; end if;
  -- Merge receipt only. Never erase request/token or an already-started fence.
  update private.modal_motion_admissions set reservation=reservation||jsonb_build_object('state','accepted','job_id',p_record->>'job_id'),
    provider_call_id=p_record->>'job_id'
    where generation_job_id=p_job_id;
  return 'true'::jsonb;
end;
$$;
revoke all on function public.modal_motion_admission(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.modal_motion_admission(uuid,text,jsonb,boolean) to service_role;
