-- Forward-only correction for Codex P1/P2 in-flight artist input races.
-- Only installed on an isolated database until a separate production release.
begin;

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
  -- The Edge Function passes the artist source values it actually showed
  -- the model. Compare under the song's row lock, not after the request.
  -- The pre-inference fingerprint alone is not enough if the artist edited
  -- between the initial song SELECT and the fingerprint RPC.
  if p_source_type = 'ai' and (
    p_provenance is null
    or p_provenance->>'expected_creative_source_fingerprint' is distinct from creative_hash
    or p_provenance->'source_snapshot' is distinct from jsonb_build_object(
      'title', song_row.title, 'artist', song_row.artist,
      'lyrics', song_row.lyrics, 'creative_direction', song_row.creative_direction,
      'notes', song_row.notes, 'visual_style_preferences', song_row.visual_style_preferences,
      'analysis_status', song_row.analysis_status, 'analysis', song_row.analysis
    )
  ) then
    raise exception 'SONG_INTERPRETATION_CREATIVE_SOURCE_STALE' using errcode = '40901';
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
    nullif(p_provider, ''), nullif(p_model, ''), coalesce(p_provenance - 'source_snapshot', '{}'::jsonb),
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

-- Atomically reject completed Worlds built from a superseded artist source.
-- Locks the project and song before writing; only the service role can call it.
create or replace function public.persist_current_interpretation_world(
 p_project_id uuid,
 p_actor_id uuid,
 p_expected_interpretation_id uuid,
 p_expected_creative_source_fingerprint text,
 p_existing_world_report_id uuid,
 p_payload jsonb
) returns public.world_reports
language plpgsql security definer set search_path = public, pg_temp as $$
declare
 project_row public.projects;
 song_row public.songs;
 interpretation_row public.song_interpretations;
 existing_row public.world_reports;
 saved public.world_reports;
begin
 select * into project_row from public.projects
  where id = p_project_id and owner_id = p_actor_id for update;
 if project_row.id is null then
   raise exception 'WORLD_PROJECT_FORBIDDEN' using errcode = '42501';
 end if;
 select * into song_row from public.songs
  where project_id = p_project_id for update;
 if song_row.id is null or song_row.interpretation_confirmed_at is null
    or song_row.analysis_status is distinct from 'completed'
    or song_row.current_interpretation_id is distinct from p_expected_interpretation_id then
   raise exception 'WORLD_INTERPRETATION_SOURCE_STALE' using errcode = '23514';
 end if;
 select * into interpretation_row from public.song_interpretations
  where id = p_expected_interpretation_id and song_id = song_row.id
    and project_id = p_project_id and status = 'confirmed';
 if interpretation_row.id is null
    or interpretation_row.audio_revision is distinct from song_row.audio_revision
    or interpretation_row.source_fingerprint is distinct from song_row.audio_source_fingerprint
    or interpretation_row.creative_source_fingerprint is null
    or interpretation_row.creative_source_fingerprint is distinct from p_expected_creative_source_fingerprint
    or public.song_creative_fingerprint(song_row.id) is distinct from p_expected_creative_source_fingerprint then
   raise exception 'WORLD_INTERPRETATION_SOURCE_STALE' using errcode = '23514';
 end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 100000
    or p_payload->>'provider' is distinct from 'groq'
    or p_payload->>'status' is distinct from 'completed'
    or exists (
       select 1 from unnest(array[
         'mood','emotional_arc','visual_language','cinematography','environments',
         'color_lighting','motifs','atmosphere','movement','continuity_rules','immutable_continuity'
       ]) as field where not (p_payload ? field)
    ) then
   raise exception 'WORLD_PAYLOAD_INVALID' using errcode = '23514';
 end if;
 if p_existing_world_report_id is null then
   -- An in-flight request cannot overwrite a World created by another request.
   if exists(select 1 from public.world_reports where project_id = p_project_id) then
     raise exception 'WORLD_REVISION_PARENT_STALE' using errcode = '23514';
   end if;
   insert into public.world_reports (
     project_id, world_id, revision_number, status,
     mood, emotional_arc, visual_language, cinematography, environments,
     color_lighting, motifs, atmosphere, movement, continuity_rules, immutable_continuity,
     raw_report, provider, provider_request_id, interpretation_id,
     interpretation_source_fingerprint, confirmed_at, error_code, error_message
   ) values (
     p_project_id, gen_random_uuid(), 1, 'completed',
     p_payload->'mood', p_payload->'emotional_arc', p_payload->'visual_language',
     p_payload->'cinematography', p_payload->'environments',
     p_payload->'color_lighting', p_payload->'motifs', p_payload->'atmosphere',
     p_payload->'movement', p_payload->'continuity_rules', p_payload->'immutable_continuity',
     p_payload->'raw_report', p_payload->>'provider', p_payload->>'provider_request_id',
     interpretation_row.id, interpretation_row.source_fingerprint, null, null, null
   ) returning * into saved;
 else
   select * into existing_row from public.world_reports
    where id = p_existing_world_report_id and project_id = p_project_id for update;
   if existing_row.id is null or existing_row.confirmed_at is not null
     or exists(select 1 from public.world_reports w
       where w.project_id = p_project_id
         and w.revision_number > existing_row.revision_number) then
     raise exception 'WORLD_REVISION_PARENT_STALE' using errcode = '23514';
   end if;
   update public.world_reports set
     status = 'completed', mood = p_payload->'mood',
     emotional_arc = p_payload->'emotional_arc',
     visual_language = p_payload->'visual_language',
     cinematography = p_payload->'cinematography',
     environments = p_payload->'environments',
     color_lighting = p_payload->'color_lighting',
     motifs = p_payload->'motifs', atmosphere = p_payload->'atmosphere',
     movement = p_payload->'movement',
     continuity_rules = p_payload->'continuity_rules',
     immutable_continuity = p_payload->'immutable_continuity',
     raw_report = p_payload->'raw_report', provider = p_payload->>'provider',
     provider_request_id = p_payload->>'provider_request_id',
     interpretation_id = interpretation_row.id,
     interpretation_source_fingerprint = interpretation_row.source_fingerprint,
     confirmed_at = null, error_code = null, error_message = null
    where id = existing_row.id and project_id = p_project_id
    returning * into saved;
 end if;
 return saved;
end;
$$;
revoke all on function public.persist_current_interpretation_world(uuid,uuid,uuid,text,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.persist_current_interpretation_world(uuid,uuid,uuid,text,uuid,jsonb)
  to service_role;

commit;
