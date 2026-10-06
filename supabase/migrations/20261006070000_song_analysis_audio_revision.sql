-- P0-A: bind song analysis authority to the exact current audio revision.
-- Existing songs receive a durable revision token without rewriting their audio.
begin;

alter table public.songs
  add column if not exists audio_revision uuid,
  add column if not exists analysis_audio_revision uuid;

update public.songs
set audio_revision = gen_random_uuid()
where audio_revision is null
  and audio_path is not null;

update public.songs
set audio_revision = gen_random_uuid()
where audio_revision is null;

alter table public.songs
  alter column audio_revision set default gen_random_uuid(),
  alter column audio_revision set not null;

create index if not exists songs_audio_revision_idx
  on public.songs(audio_revision);

create index if not exists songs_analysis_audio_revision_idx
  on public.songs(analysis_audio_revision);

create or replace function public.reset_song_analysis_on_audio_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.audio_path is distinct from old.audio_path then
    new.audio_revision = gen_random_uuid();
    new.analysis_audio_revision = null;
    new.analysis_status = 'not_started';
    new.analysis = null;
    new.analyzed_at = null;
  elsif tg_op = 'INSERT' and new.audio_revision is null then
    new.audio_revision = gen_random_uuid();
  end if;

  return new;
end;
$$;

drop trigger if exists songs_audio_revision_guard on public.songs;
create trigger songs_audio_revision_guard
before insert or update of audio_path on public.songs
for each row
execute function public.reset_song_analysis_on_audio_change();

commit;
