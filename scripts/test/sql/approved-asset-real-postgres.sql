-- Disposable real PostgreSQL regression. Run AFTER fresh-install-contract.sql.
-- Never execute against production: it intentionally uses fixture data.
begin;

-- Complete the existing fixture image job with normal lifecycle transitions.
update public.generation_jobs set provider='fixture',provider_job_id='img-a',status='submitted'
 where project_id='00000000-0000-0000-0000-000000000100' and job_type='scene_image';
update public.generation_jobs set status='processing'
 where project_id='00000000-0000-0000-0000-000000000100' and job_type='scene_image';
update public.generation_jobs set status='completed'
 where project_id='00000000-0000-0000-0000-000000000100' and job_type='scene_image';

insert into public.scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved)
 select project_id,visual_plan_id,visual_plan_scene_id,id,'fixture','fixture','https://fixture.test/image.jpg','approved',true
 from public.generation_jobs where project_id='00000000-0000-0000-0000-000000000100' and job_type='scene_image';

insert into public.generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,idempotency_key,input_snapshot)
 select project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,'scene_motion','immutability-real-postgres-motion','{}'::jsonb
 from public.generation_jobs where project_id='00000000-0000-0000-0000-000000000100' and job_type='scene_image';
update public.generation_jobs set provider='fixture',provider_job_id='mot-a',status='submitted'
 where idempotency_key='immutability-real-postgres-motion';
update public.generation_jobs set status='processing'
 where idempotency_key='immutability-real-postgres-motion';
update public.generation_jobs set status='completed'
 where idempotency_key='immutability-real-postgres-motion';

insert into public.motion_clip_assets(project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved)
 select g.project_id,g.visual_plan_id,g.visual_plan_scene_id,g.id,i.id,'fixture','fixture','https://fixture.test/motion.mp4','approved',true
 from public.generation_jobs g join public.scene_image_assets i on i.project_id=g.project_id
 where g.idempotency_key='immutability-real-postgres-motion';

do $check$ begin
 if has_table_privilege('service_role','public.scene_image_assets','TRUNCATE')
  or has_table_privilege('service_role','public.motion_clip_assets','TRUNCATE') then
    raise exception 'SERVICE_ROLE_TRUNCATE_NOT_REVOKED';
 end if;
 if not has_table_privilege('service_role','public.scene_image_assets','UPDATE')
   or not has_table_privilege('service_role','public.motion_clip_assets','DELETE') then
   raise exception 'SERVICE_ROLE_GENERATION_PRIVILEGES_LOST';
 end if;
end $check$;

-- Exercise the actual service_role grants, not only superuser behavior.
set role service_role;
do $check$ begin
 begin
  execute 'truncate table public.motion_clip_assets';
  raise exception 'TRUNCATE_BYPASS';
 exception when insufficient_privilege then null;
 end;
 begin
  delete from public.motion_clip_assets where project_id='00000000-0000-0000-0000-000000000100';
  raise exception 'DIRECT_DELETE_BYPASS';
 exception when check_violation then
   if sqlerrm <> 'GENERATED_ASSET_DELETE_FORBIDDEN' then raise; end if;
 end;
end $check$;
update public.motion_clip_assets set status='generated',approved=false
 where project_id='00000000-0000-0000-0000-000000000100';
do $check$ begin
 begin
   delete from public.motion_clip_assets where project_id='00000000-0000-0000-0000-000000000100';
   raise exception 'DEMOTE_DELETE_BYPASS';
 exception when check_violation then
   if sqlerrm <> 'GENERATED_ASSET_DELETE_FORBIDDEN' then raise; end if;
 end;
end $check$;
reset role;

-- The legitimate lifecycle can still switch approval without replacing media.
update public.motion_clip_assets set status='approved',approved=true
 where project_id='00000000-0000-0000-0000-000000000100';
do $check$ begin
 if (select count(*) from public.motion_clip_assets where project_id='00000000-0000-0000-0000-000000000100')<>1
 then raise exception 'TAKE_HISTORY_LOST'; end if;
end $check$;

-- All legacy immutability protections still reject direct edits/deletes.
do $check$ begin
  begin
    delete from public.world_reports
      where project_id='00000000-0000-0000-0000-000000000100';
    raise exception 'DIRECT_WORLD_DELETE_ALLOWED';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.style_bibles
      where project_id='00000000-0000-0000-0000-000000000100';
    raise exception 'DIRECT_STYLE_DELETE_ALLOWED';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.vision_locks
      where project_id='00000000-0000-0000-0000-000000000100';
    raise exception 'DIRECT_VISION_LOCK_DELETE_ALLOWED';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.visual_plans
      where project_id='00000000-0000-0000-0000-000000000100';
    raise exception 'DIRECT_APPROVED_PLAN_DELETE_ALLOWED';
  exception when object_not_in_prerequisite_state then null;
  end;
end $check$;

-- A parent project cascade must remain functional in a real PostgreSQL schema.
delete from public.projects where id='00000000-0000-0000-0000-000000000100';
do $check$ begin
 if exists (select 1 from public.scene_image_assets where project_id='00000000-0000-0000-0000-000000000100')
 or exists (select 1 from public.motion_clip_assets where project_id='00000000-0000-0000-0000-000000000100')
 then raise exception 'PROJECT_CASCADE_LEFT_ASSETS'; end if;
end $check$;

rollback;
select 'ASSET_IMMUTABILITY_REAL_POSTGRES_PASS' as result;
