alter table public.projects
  add column if not exists artist text;

comment on column public.projects.artist is
  'Artist/performer name supplied with the song; part of the song-first creative context.';
