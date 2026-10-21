-- Scope: correct an ambiguous PL/pgSQL identifier discovered by fresh-install
-- PostgreSQL replay. Preserve all generation-authorization predicates and
-- existing grants; do not edit the previously applied migration.
begin;
create or replace function public.reject_unlineaged_new_generation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
 lock_snapshot jsonb;
 lock_id uuid;
 locked_world_report_id uuid;
 lock_song_id uuid;
 source_id uuid;
 source_hash text;
 song_row public.songs;
 interpretation_row public.song_interpretations;
begin
  if new.job_type in ('scene_image', 'scene_motion', 'assembly') then
    select vl.snapshot, vl.world_report_id, vl.song_id
      into lock_snapshot, locked_world_report_id, lock_song_id
      from public.vision_locks vl
      where vl.id = new.vision_lock_id and vl.project_id = new.project_id;
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
           where w.id=locked_world_report_id and w.project_id=new.project_id and w.interpretation_id=source_id
           and w.interpretation_source_fingerprint=interpretation_row.source_fingerprint) then
      raise exception 'GENERATION_INTERPRETATION_SOURCE_STALE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
commit;
