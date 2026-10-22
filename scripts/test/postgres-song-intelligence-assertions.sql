-- Isolated, synthetic PostgreSQL contract assertions.
-- No external provider calls, no production roles or connection.
do $test$
declare
  p uuid := '10000000-0000-4000-8000-000000000003';
  actor uuid := '10000000-0000-4000-8000-000000000001';
  other_actor uuid := '10000000-0000-4000-8000-000000000002';
  song uuid := '10000000-0000-4000-8000-000000000004';
  revision uuid := '10000000-0000-4000-8000-000000000005';
  confirmed_id uuid;
  world_report uuid := gen_random_uuid();
  vision_lock uuid := gen_random_uuid();
  valid_job uuid := gen_random_uuid();
  ticket uuid;
  released boolean;
  hash text;
begin
  if to_regprocedure('public.song_creative_fingerprint(uuid)') is null
     or to_regprocedure('public.reserve_bragora_ai_request(uuid,uuid,text,integer)') is null
     or to_regprocedure('public.reject_unlineaged_new_generation()') is null then
    raise exception 'SONG_INTELLIGENCE_FUNCTION_MISSING';
  end if;
  if not has_table_privilege('authenticated', 'public.song_interpretations', 'SELECT')
     or has_table_privilege('authenticated', 'public.song_interpretations', 'INSERT')
     or has_table_privilege('authenticated', 'public.bragora_ai_usage_daily', 'INSERT')
     or has_table_privilege('anon', 'public.bragora_ai_usage_daily', 'SELECT')
     or has_function_privilege('authenticated', 'public.reserve_bragora_ai_request(uuid,uuid,text,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.reserve_bragora_ai_request(uuid,uuid,text,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reserve_bragora_ai_request(uuid,uuid,text,integer)', 'EXECUTE') then
    raise exception 'ROLE_PERMISSION_BOUNDARY_UNSAFE';
  end if;
  if has_function_privilege('anon', 'public.enforce_new_vision_lock_interpretation()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enforce_new_vision_lock_interpretation()', 'EXECUTE')
     or has_function_privilege('anon', 'public.reject_unlineaged_new_generation()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reject_unlineaged_new_generation()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.enforce_new_vision_lock_interpretation()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.reject_unlineaged_new_generation()', 'EXECUTE') then
    raise exception 'TRIGGER_DEFINER_FUNCTION_ACL_UNSAFE';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='storage'
      and tablename='objects' and policyname='song_audio_protect_referenced_delete'
      and cmd='DELETE' and permissive='RESTRICTIVE'
  ) then raise exception 'REFERENCED_AUDIO_DELETE_POLICY_MISSING'; end if;

  insert into public.projects(id,owner_id,title) values(p,actor,'Synthetic testing project');
  insert into public.songs(id,project_id,title,artist,audio_path,audio_revision,analysis_status,analysis)
    values(song,p,'Synthetic Song','Synthetic Artist','owner/project/recording.wav',
      revision,'completed','{"duration_seconds":12}'::jsonb);
  perform public.record_song_source_fingerprint(p,song,actor,revision,repeat('b',64),1234);
  select public.song_creative_fingerprint(song) into hash;
  if length(hash) <> 64 then raise exception 'CREATIVE_HASH_INVALID'; end if;
  begin
    perform public.record_song_source_fingerprint(p,song,other_actor,revision,repeat('b',64),1234);
    raise exception 'CROSS_OWNER_FINGERPRINT_WAS_ACCEPTED';
  exception when sqlstate '42501' then null;
  end;

  insert into public.song_interpretations (
    project_id,song_id,audio_revision,source_fingerprint,version,status,
    source_type,interpretation,evidence,created_by,creative_source_fingerprint,
    confirmed_by,confirmed_at
  ) values (
    p,song,revision,repeat('b',64),1,'confirmed','manual',
    '{"schema_version":1,"summary":"Synthetic"}'::jsonb,'[]'::jsonb,
    actor,hash,actor,now()
  ) returning id into confirmed_id;
  update public.songs set current_interpretation_id=confirmed_id,
    interpretation_confirmed_at=now() where id=song;

  -- Exercise the complete valid path, including the World table's world_id
  -- column. Fingerprint/quota-only checks did not execute this trigger branch.
  insert into public.world_reports (
    id,project_id,world_id,revision_number,status,confirmed_at,
    interpretation_id,interpretation_source_fingerprint
  ) values (
    world_report,p,world_report,1,'completed',now(),confirmed_id,repeat('b',64)
  );
  insert into public.vision_locks (
    id,project_id,world_report_id,style_bible_id,song_id,revision_number,status,snapshot
  ) values (
    vision_lock,p,world_report,gen_random_uuid(),song,1,'locked','{}'::jsonb
  );
  if (select snapshot->'interpretation_lineage'->>'interpretation_id'
      from public.vision_locks where id=vision_lock) is distinct from confirmed_id::text then
    raise exception 'VALID_LOCK_LOST_CONFIRMED_INTERPRETATION';
  end if;
  insert into public.generation_jobs (
    id,project_id,vision_lock_id,job_type,status,input_snapshot
  ) values (valid_job,p,vision_lock,'scene_image','queued','{}'::jsonb);
  if not exists(select 1 from public.generation_jobs where id=valid_job and status='queued') then
    raise exception 'VALID_LINEAGE_GENERATION_NOT_QUEUED';
  end if;
  begin
    insert into public.generation_jobs(project_id,vision_lock_id,job_type,status,input_snapshot)
      values(gen_random_uuid(),vision_lock,'scene_image','queued','{}'::jsonb);
    raise exception 'FOREIGN_PROJECT_LINEAGE_WAS_ACCEPTED';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into public.generation_jobs(project_id,vision_lock_id,job_type,status,input_snapshot)
      values(p,gen_random_uuid(),'scene_image','queued','{}'::jsonb);
    raise exception 'MISSING_LOCK_LINEAGE_WAS_ACCEPTED';
  exception when sqlstate '23514' then null;
  end;
  update public.songs set lyrics='Changed synthetic lyrics' where id=song;
  if exists(select 1 from public.songs
      where id=song and (current_interpretation_id is not null
                         or interpretation_confirmed_at is not null)) then
    raise exception 'CREATIVE_SOURCE_EDIT_DID_NOT_INVALIDATE_CONFIRMATION';
  end if;
  begin
    insert into public.generation_jobs(project_id,vision_lock_id,job_type,status,input_snapshot)
      values(p,vision_lock,'scene_image','queued','{}'::jsonb);
    raise exception 'STALE_INTERPRETATION_GENERATION_WAS_ACCEPTED';
  exception when sqlstate '23514' then null;
  end;

  begin
    perform public.reserve_bragora_ai_request(p,other_actor,'director',2);
    raise exception 'CROSS_OWNER_AI_RESERVATION_WAS_ACCEPTED';
  exception when sqlstate '42501' then null;
  end;
  select public.reserve_bragora_ai_request(p,actor,'director',2) into ticket;
  select public.release_bragora_ai_request(p,actor,'director',ticket) into released;
  if not released then raise exception 'AI_RESERVATION_RELEASE_FAILED'; end if;
  select public.reserve_bragora_ai_request(p,actor,'director',2) into ticket;
  select public.release_bragora_ai_request(p,actor,'director',ticket) into released;
  if not released then raise exception 'SECOND_AI_RESERVATION_RELEASE_FAILED'; end if;
  begin
    perform public.reserve_bragora_ai_request(p,actor,'director',2);
    raise exception 'AI_DAILY_QUOTA_NOT_ENFORCED';
  exception when sqlstate '23514' then null;
  end;
  if (select request_count from public.bragora_ai_usage_daily
      where actor_id=actor and operation='director') <> 2 then
    raise exception 'AI_DAILY_QUOTA_COUNT_WRONG';
  end if;
  raise notice 'POSTGRES_SECURITY_LINEAGE_QUOTA_ASSERTIONS_PASSED';
end
$test$;
