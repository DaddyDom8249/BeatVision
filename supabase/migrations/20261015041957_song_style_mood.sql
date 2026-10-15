-- Keep creator style/mood separate from analysis and existing creative direction.
alter table public.songs add column if not exists style_mood text;

grant insert (style_mood), update (style_mood) on public.songs to authenticated;
