-- Real application API shape on a disposable fresh database only.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.projects(id,owner_id,title,status,stage)
values ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','Fresh install fixture','Draft','song');
insert into public.songs(project_id,title,artist,audio_path)
values ('00000000-0000-0000-0000-000000000100','Fixture song','Fixture artist','00000000-0000-0000-0000-000000000001/song.mp3');
select id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at from public.songs;
-- Exercise persisted creator gates through the real owner-scoped functions.
update public.songs set analysis_status='completed',analysis='{"duration_seconds":4}',analysis_audio_revision=audio_revision,analyzed_at=now()
where project_id='00000000-0000-0000-0000-000000000100';
insert into public.world_reports(id,project_id,status)
values ('00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-000000000100','completed');
select public.confirm_world_atomic('00000000-0000-0000-0000-000000000100');
insert into public.style_bibles(id,project_id,world_report_id)
values ('00000000-0000-0000-0000-000000000600','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000500');
do $test$ begin
  begin
    perform public.create_vision_lock('00000000-0000-0000-0000-000000000100');
    raise exception 'VISION_LOCK_BYPASSED_STYLE_APPROVAL';
  exception when check_violation then
    if sqlerrm<>'VISION_LOCK_STYLE_NOT_APPROVED' then raise; end if;
  end;
end $test$;
-- Explicit approval is made only by the simulated creator in this disposable database.
update public.style_bibles set status='approved' where id='00000000-0000-0000-0000-000000000600';
select public.create_vision_lock('00000000-0000-0000-0000-000000000100');
do $test$ begin
  if (select count(*) from public.vision_locks)<>1 then raise exception 'FRESH_INSTALL_VISION_LOCK_MISSING'; end if;
  begin
    update public.vision_locks set snapshot='{}';
    raise exception 'CLIENT_VISION_LOCK_MUTATION_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $test$;
-- Persist and explicitly approve a timed scene before any generation enqueue.
insert into public.visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,title,duration_seconds)
select '00000000-0000-0000-0000-000000000200',project_id,world_report_id,style_bible_id,song_id,id,'Fixture plan',4
from public.vision_locks;
insert into public.visual_plan_scenes(id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title)
select '00000000-0000-0000-0000-000000000300',id,project_id,world_report_id,style_bible_id,song_id,1,0,4,'Fixture scene'
from public.visual_plans;
select public.approve_visual_plan('00000000-0000-0000-0000-000000000200');
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image');
  b:=public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image');
  if a.id<>b.id or a.status<>'queued' or (select count(*) from public.generation_jobs)<>1 then raise exception 'FRESH_ENQUEUE_IDEMPOTENCY_FAILED'; end if;
  begin
    perform public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
    raise exception 'FRESH_ASSEMBLY_APPROVAL_BYPASS';
  exception when object_not_in_prerequisite_state then
    if sqlerrm<>'ASSEMBLY_MOTION_NOT_FULLY_APPROVED' then raise; end if;
  end;
end $test$;
update public.songs set audio_path='00000000-0000-0000-0000-000000000001/replacement.mp3'
where project_id='00000000-0000-0000-0000-000000000100';
do $test$ begin
  if exists(select from public.songs where analysis_status<>'not_started' or analysis is not null or analysis_audio_revision is not null) then raise exception 'AUDIO_REPLACEMENT_REUSED_STALE_ANALYSIS'; end if;
  if (select snapshot->'song'->>'audio_path' from public.vision_locks limit 1)<>'00000000-0000-0000-0000-000000000001/song.mp3' then raise exception 'AUDIO_REPLACEMENT_OVERWROTE_LOCKED_SONG'; end if;
end $test$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $test$ begin
  if exists(select from public.projects) or exists(select from public.songs) or exists(select from public.vision_locks) or exists(select from public.generation_jobs) then raise exception 'FRESH_INSTALL_CROSS_OWNER_READ'; end if;
  begin
    insert into public.projects(owner_id,title,status,stage) values('00000000-0000-0000-0000-000000000001','Forbidden','Draft','song');
    raise exception 'FRESH_INSTALL_CROSS_OWNER_INSERT';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;
select 'FRESH_INSTALL_PROJECT_SONG_PASS' as result;
