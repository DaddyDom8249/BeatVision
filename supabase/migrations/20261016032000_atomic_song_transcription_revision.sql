-- Service-only, revision-bound, atomic transcription completion.
-- A replaced audio file must never receive an old transcript or duration.
-- SECURITY INVOKER uses the Edge Function's service_role, not caller-supplied JWT.
create or replace function public.complete_song_transcription(
  p_project_id uuid,
  p_song_id uuid,
  p_actor_id uuid,
  p_audio_revision uuid,
  p_audio_path text,
  p_analysis jsonb,
  p_duration numeric
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_song public.songs;
begin
  if p_actor_id is null then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  -- Project and song are locked in the same transaction. Keep project first.
  perform 1 from public.projects
   where id = p_project_id and owner_id = p_actor_id for update;
  if not found then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  select * into current_song from public.songs
   where id = p_song_id and project_id = p_project_id for update;
  if current_song.id is null
     or current_song.audio_path is distinct from p_audio_path
     or current_song.audio_revision is distinct from p_audio_revision
     or current_song.audio_path is null then
    return false;
  end if;
  if p_analysis is null or jsonb_typeof(p_analysis) <> 'object'
     or octet_length(p_analysis::text) > 1048576 then
    raise exception 'SONG_TRANSCRIPTION_INVALID' using errcode = '23514';
  end if;
  if p_duration is null or p_duration <= 0 or p_duration > 86400
     or p_duration::text in ('NaN','Infinity','-Infinity') then
    raise exception 'SONG_DURATION_INVALID' using errcode = '23514';
  end if;
  if (p_analysis->>'duration_seconds')::numeric is distinct from p_duration then
    raise exception 'SONG_DURATION_MISMATCH' using errcode = '23514';
  end if;

  update public.songs
     set analysis_status = 'completed',
         analysis = p_analysis,
         analysis_audio_revision = p_audio_revision,
         analyzed_at = now()
   where id = p_song_id and project_id = p_project_id;
  update public.projects
     set song_duration = p_duration
   where id = p_project_id;
  return true;
end;
$$;

-- Do not make the server-only completion capability callable by browsers.
revoke all on function public.complete_song_transcription(uuid,uuid,uuid,uuid,text,jsonb,numeric)
  from public, anon, authenticated;
grant execute on function public.complete_song_transcription(uuid,uuid,uuid,uuid,text,jsonb,numeric)
  to service_role;
