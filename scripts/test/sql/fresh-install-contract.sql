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
update public.songs set audio_path='00000000-0000-0000-0000-000000000001/replacement.mp3'
where project_id='00000000-0000-0000-0000-000000000100';
do $test$ begin
  if exists(select from public.songs where analysis_status<>'not_started' or analysis is not null or analysis_audio_revision is not null) then raise exception 'AUDIO_REPLACEMENT_REUSED_STALE_ANALYSIS'; end if;
  if (select snapshot->'song'->>'audio_path' from public.vision_locks limit 1)<>'00000000-0000-0000-0000-000000000001/song.mp3' then raise exception 'AUDIO_REPLACEMENT_OVERWROTE_LOCKED_SONG'; end if;
end $test$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $test$ begin
  if exists(select from public.projects) or exists(select from public.songs) or exists(select from public.vision_locks) then raise exception 'FRESH_INSTALL_CROSS_OWNER_READ'; end if;
  begin
    insert into public.projects(owner_id,title,status,stage) values('00000000-0000-0000-0000-000000000001','Forbidden','Draft','song');
    raise exception 'FRESH_INSTALL_CROSS_OWNER_INSERT';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;
select 'FRESH_INSTALL_PROJECT_SONG_PASS' as result;
