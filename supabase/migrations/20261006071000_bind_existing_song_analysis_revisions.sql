-- P0-A data reconciliation: existing completed analysis remains authoritative
-- only when it already has a current audio file and was stored before revision
-- binding existed. No analysis payload is fabricated or regenerated.
update public.songs
set analysis_audio_revision = audio_revision
where analysis_status = 'completed'
  and analysis is not null
  and audio_path is not null
  and analysis_audio_revision is null;
