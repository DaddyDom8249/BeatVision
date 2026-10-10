-- Real application API shape on a disposable fresh database only.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.projects(id,owner_id,title,status,stage)
values ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','Fresh install fixture','Draft','song');
insert into public.songs(project_id,title,artist,audio_path)
values ('00000000-0000-0000-0000-000000000100','Fixture song','Fixture artist','00000000-0000-0000-0000-000000000001/song.mp3');
select id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at from public.songs;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $test$ begin
  if exists(select from public.projects) or exists(select from public.songs) then raise exception 'FRESH_INSTALL_CROSS_OWNER_READ'; end if;
  begin
    insert into public.projects(owner_id,title,status,stage) values('00000000-0000-0000-0000-000000000001','Forbidden','Draft','song');
    raise exception 'FRESH_INSTALL_CROSS_OWNER_INSERT';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;
select 'FRESH_INSTALL_PROJECT_SONG_PASS' as result;
