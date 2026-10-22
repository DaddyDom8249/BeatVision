-- BragoraForge Song Intelligence integrity hardening (offline candidate).
-- Forward-only; original attempt-one migration is not rewritten.
begin;

-- Artist style remains distinct from inferred genre and transcription.
alter table public.songs add column if not exists visual_style_preferences jsonb
  not null default '{}'::jsonb check(jsonb_typeof(visual_style_preferences) = 'object'
    and octet_length(visual_style_preferences::text) <= 4096);
grant insert(visual_style_preferences) on public.songs to authenticated;
grant update(visual_style_preferences) on public.songs to authenticated;

-- Supabase provisions pgcrypto under extensions; absence must fail closed.
alter table public.song_interpretations
  add column if not exists creative_source_fingerprint text
  check (creative_source_fingerprint ~ '^[0-9a-f]{64}$');

create or replace function public.song_creative_fingerprint(p_song_id uuid)
returns text language sql stable security definer
set search_path = public, extensions, pg_temp as $$
  select encode(extensions.digest(convert_to((jsonb_build_object(
    'audio_revision', s.audio_revision,
    'audio_path', s.audio_path,
    'audio_sha256', s.audio_source_fingerprint,
    'title', s.title,
    'artist', s.artist,
    'lyrics', s.lyrics,
    'creative_direction', s.creative_direction,
    'notes', s.notes,
    'visual_style_preferences', s.visual_style_preferences,
    'analysis_status', s.analysis_status,
    'analysis', s.analysis
  ))::text, 'UTF8'), 'sha256'), 'hex')
  from public.songs s where s.id = p_song_id
$$;
revoke all on function public.song_creative_fingerprint(uuid) from public, anon, authenticated;
grant execute on function public.song_creative_fingerprint(uuid) to service_role;

create or replace function public.invalidate_song_interpretation_on_source_edit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if row(new.title, new.artist, new.lyrics, new.creative_direction, new.notes,
         new.analysis, new.analysis_status, new.visual_style_preferences) is distinct from
     row(old.title, old.artist, old.lyrics, old.creative_direction, old.notes,
         old.analysis, old.analysis_status, old.visual_style_preferences) then
    new.current_interpretation_id := null;
    new.interpretation_confirmed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists songs_interpretation_creative_guard on public.songs;
create trigger songs_interpretation_creative_guard
before update of title,artist,lyrics,creative_direction,notes,analysis,analysis_status,visual_style_preferences
on public.songs for each row
execute function public.invalidate_song_interpretation_on_source_edit();

create or replace function public.save_song_interpretation_draft(
  p_project_id uuid,
  p_song_id uuid,
  p_actor_id uuid,
  p_audio_revision uuid,
  p_source_fingerprint text,
  p_interpretation jsonb,
  p_evidence jsonb,
  p_source_type text,
  p_provider text,
  p_model text,
  p_provenance jsonb
) returns public.song_interpretations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
  previous public.song_interpretations;
  draft public.song_interpretations;
  next_version integer;
  creative_hash text;
begin
  if p_actor_id is null or not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_actor_id
  ) then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_source_type not in ('ai', 'manual', 'artist_edited') then
    raise exception 'SONG_INTERPRETATION_SOURCE_INVALID' using errcode = '23514';
  end if;
  if p_interpretation is null or jsonb_typeof(p_interpretation) <> 'object'
     or octet_length(p_interpretation::text) > 131072 then
    raise exception 'SONG_INTERPRETATION_INVALID' using errcode = '23514';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array'
     or octet_length(p_evidence::text) > 131072 then
    raise exception 'SONG_INTERPRETATION_EVIDENCE_INVALID' using errcode = '23514';
  end if;

  select * into song_row
    from public.songs
   where id = p_song_id and project_id = p_project_id
   for update;
  if song_row.id is null or song_row.audio_path is null then
    raise exception 'SONG_AUDIO_REQUIRED' using errcode = '23514';
  end if;
  if song_row.audio_revision is distinct from p_audio_revision
     or song_row.audio_source_fingerprint is distinct from lower(p_source_fingerprint) then
    raise exception 'SONG_INTERPRETATION_SOURCE_STALE' using errcode = '40901';
  end if;

  creative_hash := public.song_creative_fingerprint(p_song_id);
  if creative_hash is null then
    raise exception 'SONG_CREATIVE_SOURCE_MISSING' using errcode = '23514';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.song_interpretations
   where song_id = p_song_id;

  -- Draft content is immutable. A subsequent save appends a new version and
  -- leaves confirmed history available for audit and lineage inspection. Each
  -- superseded draft receives its own append-only audit event.
  for previous in
    select * from public.song_interpretations
     where song_id = p_song_id and status = 'draft'
     for update
  loop
    update public.song_interpretations
       set status = 'superseded', updated_at = now()
     where id = previous.id;
    insert into public.song_interpretation_audit_events
      (project_id, song_id, interpretation_id, event_type, actor_id, details)
    values
      (p_project_id, p_song_id, previous.id, 'draft_superseded', p_actor_id,
       jsonb_build_object('version', previous.version));
  end loop;

  insert into public.song_interpretations (
    project_id, song_id, audio_revision, source_fingerprint, creative_source_fingerprint, version, status,
    source_type, interpretation, evidence, provider, model, provenance,
    created_by
  ) values (
    p_project_id, p_song_id, p_audio_revision, lower(p_source_fingerprint),
    creative_hash, next_version, 'draft', p_source_type, p_interpretation, p_evidence,
    nullif(p_provider, ''), nullif(p_model, ''), coalesce(p_provenance, '{}'::jsonb),
    p_actor_id
  ) returning * into draft;

  insert into public.song_interpretation_audit_events
    (project_id, song_id, interpretation_id, event_type, actor_id, details)
  values
    (p_project_id, p_song_id, draft.id, 'draft_created', p_actor_id,
     jsonb_build_object('version', draft.version, 'source_type', p_source_type,
                        'source_fingerprint', lower(p_source_fingerprint),
                        'creative_source_fingerprint', creative_hash));

  return draft;
end;
$$;
create or replace function public.confirm_song_interpretation(
  p_project_id uuid,
  p_song_id uuid,
  p_interpretation_id uuid,
  p_actor_id uuid
) returns public.song_interpretations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
  candidate public.song_interpretations;
  confirmed public.song_interpretations;
  creative_hash text;
begin
  if p_actor_id is null or not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_actor_id
  ) then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  select * into song_row from public.songs
   where id = p_song_id and project_id = p_project_id for update;
  select * into candidate from public.song_interpretations
   where id = p_interpretation_id and song_id = p_song_id and project_id = p_project_id
   for update;
  if candidate.id is null then
    raise exception 'SONG_INTERPRETATION_NOT_FOUND' using errcode = '40401';
  end if;
  if candidate.status not in ('draft', 'confirmed') then
    raise exception 'SONG_INTERPRETATION_NOT_CONFIRMABLE' using errcode = '40901';
  end if;
  creative_hash := public.song_creative_fingerprint(p_song_id);
  if candidate.creative_source_fingerprint is null
     or candidate.creative_source_fingerprint is distinct from creative_hash then
    raise exception 'SONG_INTERPRETATION_CREATIVE_SOURCE_STALE' using errcode = '40901';
  end if;
  if song_row.audio_revision is distinct from candidate.audio_revision
     or song_row.audio_source_fingerprint is distinct from candidate.source_fingerprint then
    raise exception 'SONG_INTERPRETATION_SOURCE_STALE' using errcode = '40901';
  end if;

  update public.song_interpretations
     set status = 'superseded', updated_at = now()
   where song_id = p_song_id and status = 'confirmed' and id <> candidate.id;
  update public.song_interpretations
     set status = 'confirmed', confirmed_by = p_actor_id,
         confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
   where id = candidate.id
   returning * into confirmed;
  update public.songs
     set current_interpretation_id = confirmed.id,
         interpretation_confirmed_at = confirmed.confirmed_at
   where id = p_song_id and project_id = p_project_id;

  insert into public.song_interpretation_audit_events
    (project_id, song_id, interpretation_id, event_type, actor_id, details)
  values
    (p_project_id, p_song_id, confirmed.id, 'confirmed', p_actor_id,
     jsonb_build_object('version', confirmed.version,
                        'source_fingerprint', confirmed.source_fingerprint,
                        'creative_source_fingerprint', confirmed.creative_source_fingerprint));
  return confirmed;
end;
$$;
create or replace function public.enforce_new_vision_lock_interpretation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
  interpretation_row public.song_interpretations;
  world_row public.world_reports;
  snapshot jsonb;
begin
  select * into song_row from public.songs where id = new.song_id and project_id = new.project_id;
  if song_row.id is null or song_row.audio_source_fingerprint is null or song_row.current_interpretation_id is null then
    raise exception 'VISION_LOCK_INTERPRETATION_REQUIRED' using errcode = '23514';
  end if;
  select * into interpretation_row from public.song_interpretations
   where id = song_row.current_interpretation_id and song_id = song_row.id
     and status = 'confirmed';
  if interpretation_row.id is null
     or interpretation_row.source_fingerprint is distinct from song_row.audio_source_fingerprint
     or interpretation_row.audio_revision is distinct from song_row.audio_revision
     or interpretation_row.creative_source_fingerprint is null
     or interpretation_row.creative_source_fingerprint is distinct from public.song_creative_fingerprint(song_row.id)
     or song_row.interpretation_confirmed_at is null then
    raise exception 'VISION_LOCK_INTERPRETATION_REQUIRED' using errcode = '23514';
  end if;
  select * into world_row from public.world_reports
    where id = new.world_report_id and project_id = new.project_id
      and confirmed_at is not null and status = 'completed';
  if world_row.id is null or world_row.interpretation_id is distinct from interpretation_row.id
     or world_row.interpretation_source_fingerprint is distinct from interpretation_row.source_fingerprint then
    raise exception 'VISION_LOCK_WORLD_INTERPRETATION_MISMATCH' using errcode = '23514';
  end if;
  snapshot := coalesce(new.snapshot, '{}'::jsonb);
  new.snapshot := snapshot || jsonb_build_object(
    'song_interpretation', to_jsonb(interpretation_row),
    'interpretation_lineage', jsonb_build_object(
      'interpretation_id', interpretation_row.id,
      'source_fingerprint', interpretation_row.source_fingerprint,
      'creative_source_fingerprint', interpretation_row.creative_source_fingerprint,
      'audio_revision', interpretation_row.audio_revision,
      'confirmed_at', interpretation_row.confirmed_at
    )
  );
  return new;
end;
$$;
create or replace function public.reject_unlineaged_new_generation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
 lock_snapshot jsonb;
 lock_id uuid;
 world_id uuid;
 lock_song_id uuid;
 source_id uuid;
 source_hash text;
 song_row public.songs;
 interpretation_row public.song_interpretations;
begin
  if new.job_type in ('scene_image', 'scene_motion', 'assembly') then
    select snapshot, world_report_id, song_id into lock_snapshot, world_id, lock_song_id
      from public.vision_locks where id = new.vision_lock_id and project_id = new.project_id;
    if coalesce(lock_snapshot -> 'interpretation_lineage' ->> 'interpretation_id', '') = '' then
      raise exception 'GENERATION_INTERPRETATION_LINEAGE_REQUIRED' using errcode = '23514';
    end if;
    source_id := (lock_snapshot -> 'interpretation_lineage' ->> 'interpretation_id')::uuid;
    source_hash := (lock_snapshot -> 'interpretation_lineage' ->> 'creative_source_fingerprint');
    select * into song_row from public.songs where id = lock_song_id and project_id = new.project_id;
    select * into interpretation_row from public.song_interpretations where id = source_id and song_id = lock_song_id;
    if song_row.id is null or interpretation_row.id is null
      or song_row.current_interpretation_id is distinct from source_id
      or song_row.interpretation_confirmed_at is null
      or interpretation_row.status <> 'confirmed'
      or interpretation_row.creative_source_fingerprint is null
      or source_hash is distinct from interpretation_row.creative_source_fingerprint
      or public.song_creative_fingerprint(lock_song_id) is distinct from source_hash
      or not exists (select 1 from public.world_reports w
           where w.id=world_id and w.project_id=new.project_id and w.interpretation_id=source_id
           and w.interpretation_source_fingerprint=interpretation_row.source_fingerprint) then
      raise exception 'GENERATION_INTERPRETATION_SOURCE_STALE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Referenced song recordings must not be modified in place or deleted/recreated.
-- A new upload to a fresh path remains possible and failed uploads can be
-- deleted while they are not referenced by any saved Song or Vision Lock.
drop policy if exists "BeatVision authenticated update own song audio" on storage.objects;
drop policy if exists song_audio_protect_referenced_delete on storage.objects;
create policy song_audio_protect_referenced_delete on storage.objects
  as restrictive for delete to authenticated
  using (
    bucket_id <> 'songs' or (
      not exists(select 1 from public.songs s where s.audio_path = storage.objects.name)
      and not exists(select 1 from public.vision_locks l
        where l.snapshot -> 'song' ->> 'audio_path' = storage.objects.name)
    )
  );


-- Regenerate from new interpretation without editing a previously confirmed
-- World. An authenticated owner request still cannot write arbitrary columns.
create or replace function public.persist_interpretation_world_revision(
 p_project_id uuid, p_actor_id uuid, p_parent_world_report_id uuid,
 p_payload jsonb
) returns public.world_reports
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 parent public.world_reports;
 project_row public.projects;
 song_row public.songs;
 interpretation_row public.song_interpretations;
 created public.world_reports;
begin
 select * into project_row from public.projects
  where id=p_project_id and owner_id=p_actor_id for update;
 if project_row.id is null then
   raise exception 'WORLD_PROJECT_FORBIDDEN' using errcode='42501';
 end if;
 select * into parent from public.world_reports
  where id=p_parent_world_report_id and project_id=p_project_id for update;
 if parent.id is null or parent.confirmed_at is null
   or project_row.world_report_id is distinct from parent.id
   or exists(select 1 from public.world_reports w where w.project_id=p_project_id and w.revision_number>parent.revision_number) then
   raise exception 'WORLD_REVISION_PARENT_STALE' using errcode='23514';
 end if;
 select * into song_row from public.songs where project_id=p_project_id for update;
 select * into interpretation_row from public.song_interpretations
  where id=song_row.current_interpretation_id and song_id=song_row.id and status='confirmed';
 if interpretation_row.id is null or song_row.interpretation_confirmed_at is null
   or interpretation_row.audio_revision is distinct from song_row.audio_revision
   or interpretation_row.source_fingerprint is distinct from song_row.audio_source_fingerprint
   or interpretation_row.creative_source_fingerprint is distinct from public.song_creative_fingerprint(song_row.id)
   or parent.interpretation_id is not distinct from interpretation_row.id then
   raise exception 'WORLD_INTERPRETATION_REQUIRED_OR_UNCHANGED' using errcode='23514';
 end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object'
   or octet_length(p_payload::text) > 100000
   or p_payload->>'provider' is distinct from 'groq'
   or p_payload->>'status' is distinct from 'completed'
   or exists(select 1 from jsonb_array_elements_text(jsonb_build_array(
     'mood','emotional_arc','visual_language','cinematography','environments',
     'color_lighting','motifs','atmosphere','movement','continuity_rules','immutable_continuity'
   )) req(field) where not p_payload ? req.field) then
   raise exception 'WORLD_PAYLOAD_INVALID' using errcode='23514';
 end if;
 insert into public.world_reports(project_id,world_id,revision_number,status,
  mood,emotional_arc,visual_language,cinematography,environments,color_lighting,
  motifs,atmosphere,movement,continuity_rules,immutable_continuity,raw_report,
  provider,provider_request_id,interpretation_id,interpretation_source_fingerprint,
  confirmed_at)
 values (p_project_id,parent.world_id,parent.revision_number+1,'completed',
  p_payload->'mood',p_payload->'emotional_arc',p_payload->'visual_language',
  p_payload->'cinematography',p_payload->'environments',p_payload->'color_lighting',
  p_payload->'motifs',p_payload->'atmosphere',p_payload->'movement',
  p_payload->'continuity_rules',p_payload->'immutable_continuity',
  p_payload->'raw_report',p_payload->>'provider',p_payload->>'provider_request_id',
  interpretation_row.id,interpretation_row.source_fingerprint,null)
 returning * into created;
 update public.projects set world_report_id=created.id,world_confirmed_at=null
  where id=p_project_id;
 return created;
end; $$;
revoke all on function public.persist_interpretation_world_revision(uuid,uuid,uuid,jsonb)
 from public,anon,authenticated;
grant execute on function public.persist_interpretation_world_revision(uuid,uuid,uuid,jsonb)
 to service_role;

commit;
