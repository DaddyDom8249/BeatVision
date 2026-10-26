-- Additive server-owned batch state. Existing jobs/media and approvals are preserved.
create table public.generation_batches (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 visual_plan_id uuid not null references public.visual_plans(id) on delete cascade,
 kind text not null check(kind in ('image','motion')), status text not null default 'running' check(status in ('running','paused','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(visual_plan_id,kind)
);
create table public.generation_batch_items (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.generation_batches(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 scene_id uuid not null references public.visual_plan_scenes(id) on delete cascade,
 scene_number integer not null, job_id uuid references public.generation_jobs(id), skipped boolean not null default false,
 unique(batch_id,scene_id), unique(batch_id,scene_number), check(skipped or job_id is not null)
);
create index generation_batches_project on public.generation_batches(project_id);
create index generation_batch_items_project on public.generation_batch_items(project_id);
create index generation_batch_items_scene on public.generation_batch_items(scene_id);
create index generation_batch_items_job on public.generation_batch_items(job_id);
alter table public.generation_batches enable row level security;
alter table public.generation_batch_items enable row level security;
revoke all on public.generation_batches,public.generation_batch_items from public,anon,authenticated;
grant select on public.generation_batches,public.generation_batch_items to authenticated;
grant all on public.generation_batches,public.generation_batch_items to service_role;
create policy generation_batches_owner_select on public.generation_batches for select to authenticated
 using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));
create policy generation_batch_items_owner_select on public.generation_batch_items for select to authenticated
 using(exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())));

create or replace function public.start_generation_batch(p_plan_id uuid,p_kind text,p_accepted_terms boolean default false)
returns public.generation_batches language plpgsql security definer set search_path=public,pg_temp as $$
declare
 plan public.visual_plans; scene public.visual_plan_scenes; batch public.generation_batches;
 image public.scene_image_assets; template public.generation_jobs; job public.generation_jobs;
 vision public.vision_locks; source_count integer; frames integer; job_key text; job_snapshot jsonb;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id
 where vp.id=p_plan_id and p.owner_id=auth.uid() and vp.status='approved';
 if plan.id is null then raise exception 'BATCH_PLAN_NOT_APPROVED_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('image','motion') then raise exception 'BATCH_KIND_INVALID'; end if;
 perform 1 from public.projects where id=plan.project_id and owner_id=auth.uid() for update;
 perform 1 from public.visual_plans where id=plan.id and status='approved' for update;
 if not found then raise exception 'BATCH_PLAN_NOT_APPROVED_OR_FORBIDDEN'; end if;
 select * into batch from public.generation_batches where visual_plan_id=plan.id and kind=p_kind;
 if batch.id is not null then return batch; end if;
 if p_kind='motion' and p_accepted_terms is not true then raise exception 'BATCH_MOTION_TERMS_REQUIRED'; end if;
 if (select count(*) from public.visual_plan_scenes where visual_plan_id=plan.id) not between 1 and 500
 or exists(select 1 from public.visual_plan_scenes where visual_plan_id=plan.id and (project_id<>plan.project_id or status<>'approved'))
 then raise exception 'BATCH_SCENES_NOT_APPROVED'; end if;
 if p_kind='motion' and exists(select 1 from public.visual_plan_scenes where visual_plan_id=plan.id
  and (start_time::text in ('NaN','Infinity','-Infinity') or end_time::text in ('NaN','Infinity','-Infinity') or start_time<0 or end_time<=start_time or end_time-start_time>5.000001))
 then raise exception 'BATCH_SHORT_SHOT_REVISION_REQUIRED'; end if;
 insert into public.generation_batches(project_id,visual_plan_id,kind) values(plan.project_id,plan.id,p_kind) returning * into batch;
 for scene in select * from public.visual_plan_scenes where visual_plan_id=plan.id order by scene_number for update loop
  if (p_kind='image' and exists(select 1 from public.scene_image_assets a where a.project_id=plan.project_id and a.visual_plan_id=plan.id and a.scene_id=scene.id
    and a.status in ('generated','approved') and (nullif(a.storage_path,'') is not null or nullif(a.image_url,'') is not null)))
  or (p_kind='motion' and exists(select 1 from public.motion_clip_assets a where a.project_id=plan.project_id and a.visual_plan_id=plan.id and a.scene_id=scene.id
    and a.status in ('generated','approved') and a.model<>'image-motion' and nullif(a.video_url,'') is not null)) then
   insert into public.generation_batch_items(batch_id,project_id,scene_id,scene_number,skipped) values(batch.id,plan.project_id,scene.id,scene.scene_number,true);
   continue;
  end if;
  job:=null;
  if p_kind='motion' then
   select count(*) into source_count from public.scene_image_assets a where a.project_id=plan.project_id and a.visual_plan_id=plan.id and a.scene_id=scene.id and a.approved and a.status='approved' and nullif(a.storage_path,'') is not null;
   if source_count<>1 then raise exception 'BATCH_APPROVED_IMAGE_REQUIRED: scene %',scene.scene_number; end if;
   select * into image from public.scene_image_assets a where a.project_id=plan.project_id and a.visual_plan_id=plan.id and a.scene_id=scene.id and a.approved and a.status='approved' and nullif(a.storage_path,'') is not null;
  end if;
  select * into job from public.generation_jobs g where g.project_id=plan.project_id and g.visual_plan_id=plan.id and g.visual_plan_scene_id=scene.id
   and g.job_type=case when p_kind='image' then 'scene_image' else 'scene_motion' end order by created_at desc limit 1 for update;
  if job.id is not null and job.status in ('failed','completed') then raise exception 'BATCH_INDIVIDUAL_RETRY_REQUIRED: scene %',scene.scene_number; end if;
  if job.id is not null and p_kind='motion' and (job.input_snapshot->'modal_motion' is null or job.input_snapshot#>>'{modal_motion,source_image_id}'<>image.id::text) then
   raise exception 'BATCH_PENDING_SOURCE_MISMATCH: scene %',scene.scene_number;
  end if;
  if job.id is null and p_kind='image' then
   select * into vision from public.vision_locks vl where vl.id=plan.vision_lock_id and vl.project_id=plan.project_id
    and vl.world_report_id=scene.world_report_id and vl.style_bible_id=scene.style_bible_id and vl.song_id=scene.song_id;
   if vision.id is null then raise exception 'BATCH_VISION_LOCK_LINEAGE_INVALID'; end if;
   insert into public.generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,idempotency_key,input_snapshot)
   values(plan.project_id,vision.id,plan.id,scene.id,'scene_image','scene_image:'||scene.id||':'||vision.id||':variant:'||batch.id,
    jsonb_build_object('schema_version',1,'vision_lock_id',vision.id,'vision_revision',vision.revision_number,
     'visual_plan_id',plan.id,'visual_plan_scene_id',scene.id,'scene',to_jsonb(scene),
     'plan',jsonb_build_object('id',plan.id,'title',plan.title,'duration_seconds',plan.duration_seconds,'creative_thesis',plan.creative_thesis,'global_direction',plan.global_direction),
     'vision_snapshot',vision.snapshot,'generation_batch_id',batch.id)) returning * into job;
  elsif job.id is null then
   select * into template from public.generation_jobs g where g.id=image.generation_job_id and g.project_id=plan.project_id and g.visual_plan_id=plan.id
    and g.visual_plan_scene_id=scene.id and g.job_type='scene_image' and g.status='completed' and g.vision_lock_id=plan.vision_lock_id
    and g.input_snapshot#>>'{scene,id}'=scene.id::text;
   if template.id is null then raise exception 'BATCH_FROZEN_IMAGE_LINEAGE_REQUIRED'; end if;
   frames:=least(121,greatest(49,ceil(((scene.end_time-scene.start_time)*24-1)/8)::integer*8+1));
   job_key:='modal-motion:'||scene.id||':'||image.id||':e58e28c39631af4d1468ee57a853764e11c1d37e'||case when frames<>49 then ':frames:'||frames else '' end||':variant:'||batch.id;
   job_snapshot:=template.input_snapshot||jsonb_build_object('generation_batch_id',batch.id,'modal_motion',jsonb_build_object('source_image_id',image.id,'model','Lightricks/LTX-Video-0.9.5',
    'revision','e58e28c39631af4d1468ee57a853764e11c1d37e','frames',frames,'duration_seconds',frames/24.0,'terms_accepted_at',now()));
   insert into public.generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,idempotency_key,input_snapshot)
   values(plan.project_id,template.vision_lock_id,plan.id,scene.id,'scene_motion',job_key,job_snapshot) returning * into job;
  end if;
  insert into public.generation_batch_items(batch_id,project_id,scene_id,scene_number,job_id) values(batch.id,plan.project_id,scene.id,scene.scene_number,job.id);
 end loop;
 if not exists(select 1 from public.generation_batch_items where batch_id=batch.id and not skipped) then
  update public.generation_batches set status='completed',updated_at=now() where id=batch.id returning * into batch;
 end if;
 return batch;
end $$;
revoke all on function public.start_generation_batch(uuid,text,boolean) from public,anon;
grant execute on function public.start_generation_batch(uuid,text,boolean) to authenticated;

-- Reused by the scheduler and every explicit run. An individual job outside a
-- batch retains its existing behavior; a batch may dispatch only its first unfinished item.
create or replace function public.generation_batch_dispatch_allowed(p_job_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select not exists(select 1 from public.generation_batch_items where job_id=p_job_id)
 or exists(select 1 from public.generation_batch_items i join public.generation_batches b on b.id=i.batch_id
  where i.job_id=p_job_id and b.status='running' and not i.skipped
  and not exists(select 1 from public.generation_batch_items earlier left join public.generation_jobs j on j.id=earlier.job_id
   where earlier.batch_id=b.id and not earlier.skipped and earlier.scene_number<i.scene_number and j.status is distinct from 'completed'))
$$;
revoke all on function public.generation_batch_dispatch_allowed(uuid) from public,anon,authenticated;
grant execute on function public.generation_batch_dispatch_allowed(uuid) to service_role;

create or replace function public.get_generation_dispatch_queue(p_limit integer default 8)
returns setof public.generation_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Failed jobs never retry automatically. Already submitted jobs may finish while paused.
 update public.generation_batches b set status='paused',updated_at=now() where b.status='running'
 and exists(select 1 from public.generation_batch_items i join public.generation_jobs j on j.id=i.job_id where i.batch_id=b.id and not i.skipped and j.status='failed');
 update public.generation_batches b set status='completed',updated_at=now() where b.status<>'completed'
 and not exists(select 1 from public.generation_batch_items i left join public.generation_jobs j on j.id=i.job_id where i.batch_id=b.id and not i.skipped and j.status is distinct from 'completed');
 return query select g.* from public.generation_jobs g where g.status='queued' and public.generation_batch_dispatch_allowed(g.id)
 order by g.created_at,g.id limit least(8,greatest(1,coalesce(p_limit,8)));
end $$;
revoke all on function public.get_generation_dispatch_queue(integer) from public,anon,authenticated;
grant execute on function public.get_generation_dispatch_queue(integer) to service_role;

create or replace function public.set_generation_batch_paused(p_batch_id uuid,p_paused boolean)
returns public.generation_batches language plpgsql security definer set search_path=public,pg_temp as $$
declare batch public.generation_batches; item public.generation_batch_items;
begin
 select b.* into batch from public.generation_batches b join public.projects p on p.id=b.project_id where b.id=p_batch_id and p.owner_id=auth.uid() for update of b;
 if batch.id is null then raise exception 'BATCH_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_paused is null then raise exception 'BATCH_PAUSE_REQUIRED'; end if;
 if batch.status='completed' then return batch; end if;
 if not p_paused then
  for item in select i.* from public.generation_batch_items i join public.generation_jobs j on j.id=i.job_id where i.batch_id=batch.id and not i.skipped and j.status='failed' loop
   if (batch.kind='image' and exists(select 1 from public.scene_image_assets a where a.project_id=batch.project_id and a.visual_plan_id=batch.visual_plan_id and a.scene_id=item.scene_id and a.status in ('generated','approved') and (nullif(a.storage_path,'') is not null or nullif(a.image_url,'') is not null)))
    or (batch.kind='motion' and exists(select 1 from public.motion_clip_assets a where a.project_id=batch.project_id and a.visual_plan_id=batch.visual_plan_id and a.scene_id=item.scene_id and a.status in ('generated','approved') and a.model<>'image-motion' and nullif(a.video_url,'') is not null)) then
     update public.generation_batch_items set skipped=true where id=item.id;
   else raise exception 'BATCH_INDIVIDUAL_RETRY_REQUIRED: scene %',item.scene_number;
   end if;
  end loop;
 end if;
 update public.generation_batches set status=case when p_paused then 'paused' else 'running' end,updated_at=now() where id=batch.id returning * into batch;
 return batch;
end $$;
revoke all on function public.set_generation_batch_paused(uuid,boolean) from public,anon;
grant execute on function public.set_generation_batch_paused(uuid,boolean) to authenticated;

create or replace function public.get_generation_batch_progress(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not exists(select 1 from public.visual_plans vp join public.projects p on p.id=vp.project_id where vp.id=p_plan_id and p.owner_id=auth.uid()) then
 raise exception 'BATCH_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(summary) order by summary.created_at),'[]') into result from (
  select b.id,b.kind,b.created_at,
   case when count(*) filter(where i.skipped or j.status='completed')=count(*) then 'completed'
    when count(*) filter(where not i.skipped and j.status='failed')>0 then 'paused' else b.status end status,
   count(*)::integer total,count(*) filter(where i.skipped or j.status='completed')::integer done,
   count(*) filter(where not i.skipped and j.status='failed')::integer failed,
   min(i.scene_number) filter(where not i.skipped and j.status is distinct from 'completed') current_scene
  from public.generation_batches b join public.generation_batch_items i on i.batch_id=b.id
   left join public.generation_jobs j on j.id=i.job_id where b.visual_plan_id=p_plan_id group by b.id
 ) summary;
 return result;
end $$;
revoke all on function public.get_generation_batch_progress(uuid) from public,anon;
grant execute on function public.get_generation_batch_progress(uuid) to authenticated;
