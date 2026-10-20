-- Real application API shape on a disposable fresh database only.
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.projects(id,owner_id,title,status,stage)
values ('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001','Fresh install fixture','Draft','song');
insert into public.songs(project_id,title,artist,audio_path)
values ('00000000-0000-0000-0000-000000000100','Fixture song','Fixture artist','00000000-0000-0000-0000-000000000001/song.mp3');
select id,project_id,title,artist,audio_path,audio_revision,lyrics,creative_direction,notes,analysis_status,analysis,analyzed_at,created_at,updated_at from public.songs;
-- Direct AI-analysis updates must fail for authenticated creators.
-- Analysis is written only by a trusted server, never by browser role grants.
do $test$ begin
  begin
    update public.songs set analysis_status='completed'
    where project_id='00000000-0000-0000-0000-000000000100';
    raise exception 'CLIENT_SONG_ANALYSIS_WRITE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;
-- The isolated fixture administrator stands in for server-side analysis writes.
update public.songs set analysis_status='completed',analysis='{"duration_seconds":4}',analysis_audio_revision=audio_revision,analyzed_at=now()
where project_id='00000000-0000-0000-0000-000000000100';
-- Simulate the server handling real source bytes. These are disposable fixture
-- bytes, not a remote object or a client-provided fingerprint.
set role service_role;
do $test$
declare
  fixture_song public.songs;
  draft public.song_interpretations;
  fixture_bytes bytea := convert_to('isolated-fixture-audio', 'UTF8');
  fixture_hash text;
begin
  select * into fixture_song from public.songs
   where project_id='00000000-0000-0000-0000-000000000100';
  fixture_hash := encode(extensions.digest(fixture_bytes, 'sha256'), 'hex');
  if not public.record_song_source_fingerprint(
    fixture_song.project_id, fixture_song.id,
    '00000000-0000-0000-0000-000000000001',
    fixture_song.audio_revision, fixture_hash, octet_length(fixture_bytes)::bigint
  ) then
    raise exception 'FIXTURE_AUDIO_FINGERPRINT_NOT_RECORDED';
  end if;
  select * into draft from public.save_song_interpretation_draft(
    fixture_song.project_id, fixture_song.id,
    '00000000-0000-0000-0000-000000000001',
    fixture_song.audio_revision, fixture_hash,
    '{"central_message":"Artist-authored fixture interpretation"}'::jsonb,
    '[]'::jsonb, 'manual', null, null, '{}'::jsonb
  );
  if draft.id is null or draft.status <> 'draft'
    or draft.creative_source_fingerprint is distinct from
       public.song_creative_fingerprint(fixture_song.id) then
    raise exception 'FIXTURE_INTERPRETATION_DRAFT_INVALID';
  end if;
end $test$;
reset role;

-- Even a privileged direct insert must not bypass interpretation confirmation.
-- The BEFORE INSERT guard rejects it before checking the later World/Style FKs.
do $test$ begin
  begin
    insert into public.vision_locks
      (project_id, world_report_id, style_bible_id, song_id,
       revision_number, snapshot)
    select s.project_id,
      '00000000-0000-0000-0000-000000000500',
      '00000000-0000-0000-0000-000000000600',
      s.id, 1, '{}'::jsonb
    from public.songs s
    where s.project_id='00000000-0000-0000-0000-000000000100';
    raise exception 'UNCONFIRMED_INTERPRETATION_VISION_LOCK_ALLOWED';
  exception when check_violation then
    if sqlerrm <> 'VISION_LOCK_INTERPRETATION_REQUIRED' then raise; end if;
  end;
  if exists(select 1 from public.vision_locks) then
    raise exception 'UNCONFIRMED_INTERPRETATION_VISION_LOCK_PERSISTED';
  end if;
end $test$;

-- An authenticated browser cannot call the privileged confirmation RPC.
do $test$ begin
  if has_function_privilege('authenticated',
    'public.confirm_song_interpretation(uuid,uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'INTERPRETATION_CONFIRM_RPC_EXPOSED_TO_BROWSER';
  end if;
end $test$;

-- Artist approval is recorded only through the owner-checked server RPC.
set role service_role;
do $test$
declare
  fixture_song public.songs;
  draft_id uuid;
  approved public.song_interpretations;
begin
  select * into fixture_song from public.songs
   where project_id='00000000-0000-0000-0000-000000000100';
  select id into draft_id from public.song_interpretations
   where song_id=fixture_song.id and status='draft';
  select * into approved from public.confirm_song_interpretation(
    fixture_song.project_id, fixture_song.id, draft_id,
    '00000000-0000-0000-0000-000000000001'
  );
  if approved.id is distinct from draft_id or approved.status <> 'confirmed'
    or approved.confirmed_at is null or approved.confirmed_by is distinct from
       '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FIXTURE_INTERPRETATION_APPROVAL_INVALID';
  end if;
end $test$;
reset role;

-- The isolated fixture administrator stands in for the server's approved
-- World output; its lineage must refer to exactly that confirmed interpretation.
insert into public.world_reports
  (id, project_id, status, interpretation_id, interpretation_source_fingerprint)
select '00000000-0000-0000-0000-000000000500',
       s.project_id, 'completed', i.id, i.source_fingerprint
from public.songs s
join public.song_interpretations i on i.id=s.current_interpretation_id
where s.project_id='00000000-0000-0000-0000-000000000100'
  and i.status='confirmed'
  and i.creative_source_fingerprint=public.song_creative_fingerprint(s.id);

set role authenticated;
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
-- Direct client inserts into authoritative visual plans must be rejected.
do $test$ begin
  begin
    insert into public.visual_plans(id,project_id,title,duration_seconds)
    values ('00000000-0000-0000-0000-000000000299','00000000-0000-0000-0000-000000000100','Forbidden browser plan',4);
    raise exception 'CLIENT_VISUAL_PLAN_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $test$;
-- The isolated administrator creates plan/scene fixture rows; the creator
-- must still explicitly approve via the owner-scoped RPC below.
reset role;
insert into public.visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,title,duration_seconds)
select '00000000-0000-0000-0000-000000000200',project_id,world_report_id,style_bible_id,song_id,id,'Fixture plan',4
from public.vision_locks;
insert into public.visual_plan_scenes(id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title)
select '00000000-0000-0000-0000-000000000300',id,project_id,world_report_id,style_bible_id,song_id,1,0,4,'Fixture scene'
from public.visual_plans;
set role authenticated;
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
