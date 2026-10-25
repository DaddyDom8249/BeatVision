-- Explicit owner take replacement; media/lineage and frozen jobs stay immutable.
create table public.motion_clip_approval_history (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 visual_plan_id uuid not null references public.visual_plans(id),
 scene_id uuid not null references public.visual_plan_scenes(id),
 previous_asset_id uuid not null references public.motion_clip_assets(id),
 selected_asset_id uuid not null references public.motion_clip_assets(id),
 actor_id uuid not null,
 previous_approval jsonb not null,
 selected_approval jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.motion_clip_approval_history enable row level security;
revoke all on public.motion_clip_approval_history from public,anon,authenticated,service_role;
grant select on public.motion_clip_approval_history to authenticated,service_role;
create policy motion_clip_approval_history_owner_select on public.motion_clip_approval_history
 for select to authenticated using(exists(select 1 from public.projects p where p.id=motion_clip_approval_history.project_id and p.owner_id=(select auth.uid())));
create or replace function public.protect_motion_approval_history()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' and not exists(select 1 from public.projects where id=old.project_id) then return old; end if;
 raise exception 'MOTION_APPROVAL_HISTORY_IMMUTABLE' using errcode='23514';
end; $$;
revoke all on function public.protect_motion_approval_history() from public,anon,authenticated;
create trigger motion_approval_history_immutable before update or delete on public.motion_clip_approval_history
 for each row execute function public.protect_motion_approval_history();

create or replace function public.replace_approved_motion_clip(p_asset_id uuid,p_expected_approved_id uuid)
returns public.motion_clip_assets language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.motion_clip_assets; previous public.motion_clip_assets; approved_count integer;
begin
 select m.* into target from public.motion_clip_assets m join public.projects p on p.id=m.project_id
 where m.id=p_asset_id and p.owner_id=auth.uid();
 if target.id is null or auth.uid() is null then raise exception 'MOTION_CLIP_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.projects where id=target.project_id and owner_id=auth.uid() for share;
 if not found then raise exception 'MOTION_CLIP_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 -- Same lock order as assembly enqueue. An in-flight frozen edit is never revoked.
 perform 1 from public.visual_plans where id=target.visual_plan_id and project_id=target.project_id and status='approved' for update;
 if not found then raise exception 'VISUAL_PLAN_NOT_LOCKED' using errcode='55000'; end if;
 perform 1 from public.visual_plan_scenes where id=target.scene_id and visual_plan_id=target.visual_plan_id
  and project_id=target.project_id and status='approved' for update;
 if not found then raise exception 'SCENE_NOT_APPROVED_OR_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.motion_clip_assets where scene_id=target.scene_id for update;
 select m.* into target from public.motion_clip_assets m
 join public.generation_jobs g on g.id=m.generation_job_id and g.project_id=m.project_id
  and g.visual_plan_id=m.visual_plan_id and g.visual_plan_scene_id=m.scene_id and g.job_type='scene_motion' and g.status='completed'
 join public.scene_image_assets i on i.id=m.scene_image_id and i.project_id=m.project_id
  and i.visual_plan_id=m.visual_plan_id and i.scene_id=m.scene_id and i.approved=true and i.status='approved'
 where m.id=p_asset_id and ((m.status='generated' and m.approved=false) or (m.status='approved' and m.approved=true))
  and trim(m.video_url)<>'' and m.video_url ~* '^https?://';
 if target.id is null then raise exception 'MOTION_CLIP_ASSET_NOT_APPROVABLE' using errcode='55000'; end if;
 select count(*) into approved_count from public.motion_clip_assets where project_id=target.project_id
  and visual_plan_id=target.visual_plan_id and scene_id=target.scene_id and approved=true and status='approved';
 if approved_count<>1 then raise exception 'MOTION_APPROVAL_CHANGED' using errcode='40001'; end if;
 select * into previous from public.motion_clip_assets where project_id=target.project_id
  and visual_plan_id=target.visual_plan_id and scene_id=target.scene_id and approved=true and status='approved';
 if previous.id=target.id then return target; end if;
 if previous.id is distinct from p_expected_approved_id then raise exception 'MOTION_APPROVAL_CHANGED' using errcode='40001'; end if;
 if exists(select 1 from public.generation_jobs where project_id=target.project_id and visual_plan_id=target.visual_plan_id
  and job_type='assembly' and status in ('queued','submitted','processing')) then
  raise exception 'MOTION_APPROVAL_ASSEMBLY_IN_PROGRESS' using errcode='55000'; end if;
 update public.motion_clip_assets set approved=false,status='generated' where id=previous.id;
 update public.motion_clip_assets set approved=true,status='approved' where id=target.id and approved=false and status='generated'
  returning * into target;
 if target.id is null then raise exception 'MOTION_APPROVAL_CHANGED' using errcode='40001'; end if;
 insert into public.motion_clip_approval_history(project_id,visual_plan_id,scene_id,previous_asset_id,selected_asset_id,
  actor_id,previous_approval,selected_approval)
 values(target.project_id,target.visual_plan_id,target.scene_id,previous.id,target.id,auth.uid(),to_jsonb(previous),to_jsonb(target));
 return target;
end; $$;
revoke all on function public.replace_approved_motion_clip(uuid,uuid) from public,anon;
grant execute on function public.replace_approved_motion_clip(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_assembly_generation(p_project_id uuid, p_visual_plan_id uuid)
 RETURNS generation_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  current_motion_ids text[];
begin

  -- Job writes remain server-only; authorize the caller before privileged reads.
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = (select auth.uid())
  ) then
    raise exception 'GENERATION_PROJECT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  select vp.* into plan from public.visual_plans vp
   where vp.id=p_visual_plan_id and vp.project_id=p_project_id and vp.status='approved' for update;
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
  select array_agg(m.id::text order by m.id::text) into current_motion_ids from public.motion_clip_assets m
   where m.project_id=p_project_id and m.visual_plan_id=plan.id and m.approved=true and m.status='approved';
  -- Reuse only attempts frozen against this exact set of selected clips.
  -- Serialise attempts on this plan. Never change a failed job or its snapshot.
  select gj.* into existing_job from public.generation_jobs gj
   where gj.project_id=p_project_id and gj.visual_plan_id=plan.id
     and gj.vision_lock_id=lock.id and gj.job_type='assembly'
     and (select array_agg(item->>'asset_id' order by item->>'asset_id')
       from jsonb_array_elements(coalesce(gj.input_snapshot->'motion_clips','[]'::jsonb)) item)=current_motion_ids
   order by (gj.status <> 'failed') desc, gj.created_at desc, gj.id desc limit 1;
  if existing_job.id is not null and existing_job.status <> 'failed' then return existing_job; end if;
  key:=concat('assembly:',plan.id::text,':',lock.id::text,':motion:',md5(array_to_string(current_motion_ids,',')));
  if existing_job.id is not null then
    key:=concat(key,':retry:',gen_random_uuid()::text);
  end if;
  insert into public.generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,idempotency_key,input_snapshot)
  values(p_project_id,lock.id,plan.id,null,'assembly',key,jsonb_build_object(
    'schema_version',1,'vision_lock_id',lock.id,'vision_revision',lock.revision_number,'visual_plan_id',plan.id,'audio_path',audio_path,'vision_snapshot',lock.snapshot,
    'plan',jsonb_build_object('id',plan.id,'title',plan.title,'duration_seconds',plan.duration_seconds,'creative_thesis',plan.creative_thesis,'global_direction',plan.global_direction),
    'scenes',(select coalesce(jsonb_agg(to_jsonb(s) order by s.scene_number),'[]'::jsonb) from public.visual_plan_scenes s where s.project_id=p_project_id and s.visual_plan_id=plan.id),
    'motion_clips',(select coalesce(jsonb_agg(jsonb_build_object('asset_id',m.id,'scene',s.scene_number,'video_url',m.video_url,'provider',m.provider,'model',m.model,'generation_type',case
        when m.model='image-motion' or 'PROCEDURAL_MOTION'=any(array[
          motion_job.output #>> '{arena_response,result,generation_type}',
          motion_job.output #>> '{arena_status_response,result,generation_type}',
          motion_job.output #>> '{result,generation_type}'
        ]) then 'PROCEDURAL_MOTION'
        when 'GENERATIVE_VIDEO'=any(array[
          motion_job.output #>> '{arena_response,result,generation_type}',
          motion_job.output #>> '{arena_status_response,result,generation_type}',
          motion_job.output #>> '{result,generation_type}'
        ]) then 'GENERATIVE_VIDEO'
        else 'UNKNOWN'
      end,'requested_duration_seconds',s.end_time-s.start_time) order by s.scene_number),'[]'::jsonb)
      from public.motion_clip_assets m join public.visual_plan_scenes s on s.id=m.scene_id
      left join public.generation_jobs motion_job
        on motion_job.id=m.generation_job_id
        and motion_job.project_id=m.project_id
        and motion_job.visual_plan_id=m.visual_plan_id
        and motion_job.visual_plan_scene_id=m.scene_id
        and motion_job.job_type='scene_motion'
        and motion_job.status='completed'
      where m.project_id=p_project_id and m.visual_plan_id=plan.id and m.status='approved' and m.approved=true)
  )) returning * into created_job;
  return created_job;
end;
$function$;

revoke all on function public.enqueue_assembly_generation(uuid,uuid) from public,anon;
grant execute on function public.enqueue_assembly_generation(uuid,uuid) to authenticated;

