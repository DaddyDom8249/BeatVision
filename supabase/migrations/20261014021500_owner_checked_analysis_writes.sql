-- Browser DSP remains a declared measurement/heuristic input; server transcription is separate.
create or replace function public.save_local_song_analysis(p_project_id uuid,p_song_id uuid,p_audio_revision text,p_status text,p_analysis jsonb default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare song public.songs; duration numeric; segment jsonb;
begin
 if not exists(select 1 from projects where id=p_project_id and owner_id=auth.uid()) then raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 select * into song from songs where id=p_song_id and project_id=p_project_id for update;
 if song.id is null or song.audio_path is null then raise exception 'SONG_AUDIO_REQUIRED' using errcode='23514'; end if;
 if song.audio_revision::text is distinct from p_audio_revision then raise exception 'SONG_AUDIO_REVISION_CHANGED' using errcode='40001'; end if;
 if p_status is null or p_status not in ('analyzing','completed','failed') then raise exception 'SONG_ANALYSIS_STATUS_INVALID' using errcode='23514'; end if;
 if p_analysis is not null then
  if jsonb_typeof(p_analysis)<>'object' or octet_length(p_analysis::text)>1048576 or (p_analysis->>'analysis_method') is distinct from 'browser_audio_decode' then raise exception 'LOCAL_ANALYSIS_INVALID' using errcode='23514'; end if;
  duration:=(p_analysis->>'duration_seconds')::numeric;
  if duration is null or duration<=0 or duration>86400 or duration::text in ('NaN','Infinity','-Infinity') then raise exception 'LOCAL_ANALYSIS_DURATION_INVALID' using errcode='23514'; end if;
  if p_analysis ? 'sections' and jsonb_typeof(p_analysis->'sections')<>'array' then raise exception 'LOCAL_ANALYSIS_SECTIONS_INVALID' using errcode='23514'; end if;
  for segment in select value from jsonb_array_elements(coalesce(p_analysis->'sections','[]')) loop
   if segment->>'start_time' is null or segment->>'end_time' is null or (segment->>'start_time')::numeric<0 or (segment->>'end_time')::numeric<=(segment->>'start_time')::numeric or (segment->>'end_time')::numeric>duration then raise exception 'LOCAL_ANALYSIS_SECTIONS_INVALID' using errcode='23514'; end if;
  end loop;
 elsif p_status='completed' then raise exception 'LOCAL_ANALYSIS_REQUIRED' using errcode='23514'; end if;
 update songs set analysis_status=p_status,
  analysis=case when p_analysis is null then analysis else
   (p_analysis-'transcript'-'transcript_segments'-'word_timestamps'-'raw_provider_output'-'transcription_provider'-'transcription_model') || jsonb_build_object('transcription_status',case when p_analysis->>'transcription_status'='failed' then 'failed' else 'unavailable' end)
  end,
  analyzed_at=case when p_status='completed' then now() else analyzed_at end
 where id=p_song_id;
end; $$;
revoke all on function public.save_local_song_analysis(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.save_local_song_analysis(uuid,uuid,text,text,jsonb) to authenticated;
revoke insert,update on public.songs from public,anon,authenticated;
grant insert(project_id,title,artist,lyrics,creative_direction,notes,audio_path) on public.songs to authenticated;
grant update(title,artist,lyrics,creative_direction,notes,audio_path) on public.songs to authenticated;
