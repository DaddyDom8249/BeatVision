alter table public.scene_image_assets add column reused_from_image_id uuid references public.scene_image_assets(id) deferrable initially deferred,
 add column source_generation_job_id uuid references public.generation_jobs(id) on delete restrict;
alter table public.scene_image_assets alter column generation_job_id drop not null;
alter table public.scene_image_assets add constraint image_generation_or_reuse check(
 (reused_from_image_id is null and source_generation_job_id is null and generation_job_id is not null)
 or (reused_from_image_id is not null and source_generation_job_id is not null and generation_job_id is null));
create unique index scene_image_reuse_unique on public.scene_image_assets(scene_id,reused_from_image_id) where reused_from_image_id is not null;

create or replace function public.can_reuse_scene_image(p_asset_id uuid,p_scene_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.scene_image_assets a
 join public.visual_plan_scenes old on old.id=a.scene_id and old.visual_plan_id=a.visual_plan_id and old.project_id=a.project_id
 join public.visual_plans parent on parent.id=a.visual_plan_id
 join public.visual_plan_scenes target on target.id=p_scene_id and target.project_id=a.project_id
 join public.visual_plans child on child.id=target.visual_plan_id and child.project_id=a.project_id and child.parent_plan_id=parent.id
 where a.id=p_asset_id and a.status='approved' and a.approved and nullif(a.storage_path,'') is not null
 and parent.vision_lock_id=child.vision_lock_id and parent.world_report_id=child.world_report_id
 and parent.style_bible_id=child.style_bible_id and parent.song_id=child.song_id
 and old.scene_number=target.scene_number and old.start_time=target.start_time and old.end_time=target.end_time
 and old.visual_direction is not distinct from target.visual_direction and old.location is not distinct from target.location
 and old.mood is not distinct from target.mood and old.lyric_moment is not distinct from target.lyric_moment
 and old.continuity_notes is not distinct from target.continuity_notes);
$$;
revoke all on function public.can_reuse_scene_image(uuid,uuid) from public,anon,authenticated;
grant execute on function public.can_reuse_scene_image(uuid,uuid) to service_role;

create or replace function public.enforce_scene_image_asset_lineage()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare plan_project_id uuid; scene_project_id uuid; scene_plan_id uuid; job_project_id uuid; job_scene_id uuid; job_status text; source public.scene_image_assets;
begin
 if tg_op='UPDATE' and (new.reused_from_image_id is distinct from old.reused_from_image_id or new.source_generation_job_id is distinct from old.source_generation_job_id) then raise exception 'IMAGE_REUSE_PROVENANCE_IMMUTABLE'; end if;
 if new.reused_from_image_id is not null then
  select * into source from public.scene_image_assets where id=new.reused_from_image_id;
  if new.generation_job_id is not null or source.id is null or not public.can_reuse_scene_image(source.id,new.scene_id)
   or new.source_generation_job_id is distinct from coalesce(source.generation_job_id,source.source_generation_job_id)
   or new.project_id is distinct from source.project_id or new.provider is distinct from source.provider or new.model is distinct from source.model
   or new.image_url is distinct from source.image_url or new.storage_path is distinct from source.storage_path
   or not exists(select 1 from public.visual_plan_scenes where id=new.scene_id and visual_plan_id=new.visual_plan_id and project_id=new.project_id)
   or not exists(select 1 from public.generation_jobs where id=new.source_generation_job_id and project_id=new.project_id and job_type='scene_image' and status='completed')
   then raise exception 'SCENE_IMAGE_REUSE_LINEAGE_INVALID' using errcode='23514'; end if;
  return new;
 end if;
 select project_id into plan_project_id from public.visual_plans where id=new.visual_plan_id;
 select project_id,visual_plan_id into scene_project_id,scene_plan_id from public.visual_plan_scenes where id=new.scene_id;
 select project_id,visual_plan_scene_id,status into job_project_id,job_scene_id,job_status from public.generation_jobs where id=new.generation_job_id;
 if plan_project_id is null or scene_project_id is null or job_project_id is null or plan_project_id<>new.project_id or scene_project_id<>new.project_id or job_project_id<>new.project_id or scene_plan_id<>new.visual_plan_id or job_scene_id<>new.scene_id or job_status not in ('processing','completed') then raise exception 'SCENE_IMAGE_ASSET_LINEAGE_INVALID' using errcode='23514'; end if;
 return new;
end $$;

create or replace function public.revision_media_context(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.visual_plans; candidates jsonb; history jsonb;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id where vp.id=p_plan_id and p.owner_id=auth.uid();
 if plan.id is null then raise exception 'REVISION_MEDIA_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('scene_id',s.id,'source_asset_id',a.id,'scene_number',s.scene_number) order by s.scene_number),'[]') into candidates
 from public.visual_plan_scenes s
 join public.visual_plan_scenes previous on previous.visual_plan_id=plan.parent_plan_id and previous.scene_number=s.scene_number
 join public.scene_image_assets a on a.scene_id=previous.id and a.visual_plan_id=plan.parent_plan_id and public.can_reuse_scene_image(a.id,s.id)
 where s.visual_plan_id=plan.id and not exists(select 1 from public.scene_image_assets current where current.scene_id=s.id and current.status in ('generated','approved'));
 select coalesce(jsonb_agg(to_jsonb(h) order by h.revision_number desc),'[]') into history from
 (select vp.id,vp.revision_number,vp.status,(select count(*) from public.scene_image_assets a where a.visual_plan_id=vp.id) images,
 (select count(*) from public.motion_clip_assets a where a.visual_plan_id=vp.id) clips
 from public.visual_plans vp where vp.project_id=plan.project_id and vp.id<>plan.id order by revision_number desc limit 50) h;
 return jsonb_build_object('plan_id',plan.id,'parent_plan_id',plan.parent_plan_id,'candidates',candidates,'history',history);
end $$;
revoke all on function public.revision_media_context(uuid) from public,anon;
grant execute on function public.revision_media_context(uuid) to authenticated;

create or replace function public.reuse_revision_images(p_plan_id uuid,p_choices jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.visual_plans; choice jsonb; source public.scene_image_assets; target public.visual_plan_scenes; n integer:=0;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id where vp.id=p_plan_id and p.owner_id=auth.uid();
 if plan.id is null then raise exception 'REVISION_MEDIA_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.projects where id=plan.project_id and owner_id=auth.uid() for update;
 if not found then raise exception 'REVISION_MEDIA_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.generation_batches where visual_plan_id=plan.id and kind='image' for update;
 if exists(select 1 from public.generation_batches where visual_plan_id=plan.id and kind='image' and status='running') then raise exception 'IMAGE_REUSE_PAUSE_BATCH_FIRST'; end if;
 if p_choices is null or jsonb_typeof(p_choices)<>'array' then raise exception 'IMAGE_REUSE_INVALID'; end if;
 if jsonb_array_length(p_choices) not between 1 and 500 or (select count(distinct value->>'scene_id') from jsonb_array_elements(p_choices))<>jsonb_array_length(p_choices) then raise exception 'IMAGE_REUSE_INVALID'; end if;
 for choice in select value from jsonb_array_elements(p_choices) loop
  select * into target from public.visual_plan_scenes where id=(choice->>'scene_id')::uuid and visual_plan_id=plan.id and project_id=plan.project_id for update;
  select * into source from public.scene_image_assets where id=(choice->>'source_asset_id')::uuid for share;
  if target.id is null or source.id is null or not public.can_reuse_scene_image(source.id,target.id) then raise exception 'IMAGE_REUSE_INCOMPATIBLE'; end if;
  if exists(select 1 from public.scene_image_assets where scene_id=target.id and reused_from_image_id=source.id) then continue; end if;
  if exists(select 1 from public.scene_image_assets where scene_id=target.id and status in ('generated','approved')) then raise exception 'IMAGE_REUSE_CHOICE_CHANGED'; end if;
  if exists(select 1 from public.generation_jobs where visual_plan_scene_id=target.id and job_type='scene_image' and status in ('submitted','processing')) then raise exception 'IMAGE_REUSE_GENERATION_ACTIVE'; end if;
  if exists(select 1 from public.generation_jobs g where g.visual_plan_scene_id=target.id and g.job_type='scene_image' and g.status='queued'
   and not exists(select 1 from public.generation_batch_items i join public.generation_batches b on b.id=i.batch_id where i.job_id=g.id and b.status='paused')) then raise exception 'IMAGE_REUSE_INDIVIDUAL_JOB_PENDING'; end if;
  insert into public.scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,reused_from_image_id,source_generation_job_id,provider,model,image_url,storage_path,status,approved)
  values(plan.project_id,plan.id,target.id,null,source.id,coalesce(source.generation_job_id,source.source_generation_job_id),source.provider,source.model,source.image_url,source.storage_path,'generated',false);
  update public.generation_batch_items i set skipped=true from public.generation_batches b where i.batch_id=b.id and b.visual_plan_id=plan.id and b.kind='image' and i.scene_id=target.id;
  n:=n+1;
 end loop;
 update public.generation_batches b set status='completed',updated_at=now() where visual_plan_id=plan.id and kind='image' and not exists(select 1 from public.generation_batch_items i where i.batch_id=b.id and not i.skipped);
 return n;
end $$;
revoke all on function public.reuse_revision_images(uuid,jsonb) from public,anon;
grant execute on function public.reuse_revision_images(uuid,jsonb) to authenticated;

create or replace function public.motion_snapshot_for_image(p_asset_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare image public.scene_image_assets; job public.generation_jobs; scene public.visual_plan_scenes; plan public.visual_plans; snapshot jsonb;
begin
 select * into image from public.scene_image_assets where id=p_asset_id and status='approved' and approved;
 select * into scene from public.visual_plan_scenes where id=image.scene_id and visual_plan_id=image.visual_plan_id and project_id=image.project_id and status='approved';
 select * into plan from public.visual_plans where id=image.visual_plan_id and project_id=image.project_id and status='approved';
 select * into job from public.generation_jobs where id=coalesce(image.generation_job_id,image.source_generation_job_id) and project_id=image.project_id and job_type='scene_image' and status='completed' and vision_lock_id=plan.vision_lock_id;
 if image.id is null or scene.id is null or plan.id is null or job.id is null then raise exception 'FROZEN_LINEAGE_REQUIRED'; end if;
 if image.reused_from_image_id is null then
  if job.visual_plan_id<>plan.id or job.visual_plan_scene_id<>scene.id or job.input_snapshot#>>'{scene,id}'<>scene.id::text then raise exception 'FROZEN_LINEAGE_REQUIRED'; end if;
  snapshot:=job.input_snapshot;
 else
  if not public.can_reuse_scene_image(image.reused_from_image_id,scene.id) then raise exception 'IMAGE_REUSE_INCOMPATIBLE'; end if;
  snapshot:=job.input_snapshot||jsonb_build_object('visual_plan_id',plan.id,'visual_plan_scene_id',scene.id,'scene',to_jsonb(scene),'plan',jsonb_build_object('id',plan.id,'title',plan.title,'duration_seconds',plan.duration_seconds,'creative_thesis',plan.creative_thesis,'global_direction',plan.global_direction),
   'image_reuse',jsonb_build_object('source_image_asset_id',image.reused_from_image_id,'source_generation_job_id',job.id,'reused_asset_id',image.id));
 end if;
 return jsonb_build_object('vision_lock_id',job.vision_lock_id,'visual_plan_id',plan.id,'input_snapshot',snapshot);
end $$;
revoke all on function public.motion_snapshot_for_image(uuid) from public,anon,authenticated;
grant execute on function public.motion_snapshot_for_image(uuid) to service_role;
CREATE OR REPLACE FUNCTION public.approve_scene_image_asset(p_asset_id uuid)
 RETURNS scene_image_assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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


  select a.* into asset from public.scene_image_assets a
  join public.visual_plans vp on vp.id=a.visual_plan_id and vp.status='approved'
  join public.visual_plan_scenes s on s.id=a.scene_id and s.status='approved'
  where a.id=p_asset_id and a.reused_from_image_id is not null
    and a.status='generated' and not a.approved and public.can_reuse_scene_image(a.reused_from_image_id,a.scene_id);
  if asset.id is not null then
    perform 1 from public.visual_plan_scenes where id=asset.scene_id for update;
    if exists(select 1 from public.scene_image_assets other where other.scene_id=asset.scene_id and other.approved and other.id<>asset.id) then
      raise exception 'SCENE_IMAGE_ALREADY_APPROVED_USE_PLAN_REVISION';
    end if;
    update public.scene_image_assets set status='approved',approved=true where id=asset.id returning * into asset;
    return asset;
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
$function$;

CREATE OR REPLACE FUNCTION public.start_generation_batch(p_plan_id uuid, p_kind text, p_accepted_terms boolean DEFAULT false)
 RETURNS generation_batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 plan public.visual_plans; scene public.visual_plan_scenes; batch public.generation_batches;
 image public.scene_image_assets; template public.generation_jobs; job public.generation_jobs;
 vision public.vision_locks; source_count integer; frames integer; job_key text; job_snapshot jsonb;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id
 where vp.id=p_plan_id and p.owner_id=auth.uid() and vp.status='approved';
 if plan.id is null then raise exception 'BATCH_PLAN_NOT_APPROVED_OR_FORBIDDEN' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('image','motion') then raise exception 'BATCH_KIND_INVALID'; end if;
 if p_kind='image' and jsonb_array_length(public.revision_media_context(plan.id)->'candidates')>0 then raise exception 'BATCH_REUSE_REVIEW_REQUIRED'; end if;
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
   select * into template from public.generation_jobs g where g.id=coalesce(image.generation_job_id,image.source_generation_job_id) and g.project_id=plan.project_id
    and g.job_type='scene_image' and g.status='completed' and g.vision_lock_id=plan.vision_lock_id;
   if template.id is null then raise exception 'BATCH_FROZEN_IMAGE_LINEAGE_REQUIRED'; end if;
   frames:=least(121,greatest(49,ceil(((scene.end_time-scene.start_time)*24-1)/8)::integer*8+1));
   job_key:='modal-motion:'||scene.id||':'||image.id||':e58e28c39631af4d1468ee57a853764e11c1d37e'||case when frames<>49 then ':frames:'||frames else '' end||':variant:'||batch.id;
   job_snapshot:=(public.motion_snapshot_for_image(image.id)->'input_snapshot')||jsonb_build_object('generation_batch_id',batch.id,'modal_motion',jsonb_build_object('source_image_id',image.id,'model','Lightricks/LTX-Video-0.9.5',
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
end $function$;
