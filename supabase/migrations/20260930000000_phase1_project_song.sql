create extension if not exists pgcrypto;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'draft' check (status in ('draft', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  artist text not null check (length(trim(artist)) > 0),
  audio_path text,
  lyrics text,
  creative_direction text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint songs_project_id_unique unique (project_id)
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists songs_project_id_idx on public.songs(project_id);

alter table public.projects enable row level security;
alter table public.songs enable row level security;

drop policy if exists "projects_owner_select" on public.projects;
create policy "projects_owner_select" on public.projects for select using (user_id = auth.uid());
drop policy if exists "projects_owner_insert" on public.projects;
create policy "projects_owner_insert" on public.projects for insert with check (user_id = auth.uid());
drop policy if exists "projects_owner_update" on public.projects;
create policy "projects_owner_update" on public.projects for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "projects_owner_delete" on public.projects;
create policy "projects_owner_delete" on public.projects for delete using (user_id = auth.uid());

drop policy if exists "songs_owner_select" on public.songs;
create policy "songs_owner_select" on public.songs for select using (exists (select 1 from public.projects p where p.id = songs.project_id and p.user_id = auth.uid()));
drop policy if exists "songs_owner_insert" on public.songs;
create policy "songs_owner_insert" on public.songs for insert with check (exists (select 1 from public.projects p where p.id = songs.project_id and p.user_id = auth.uid()));
drop policy if exists "songs_owner_update" on public.songs;
create policy "songs_owner_update" on public.songs for update using (exists (select 1 from public.projects p where p.id = songs.project_id and p.user_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = songs.project_id and p.user_id = auth.uid()));
drop policy if exists "songs_owner_delete" on public.songs;
create policy "songs_owner_delete" on public.songs for delete using (exists (select 1 from public.projects p where p.id = songs.project_id and p.user_id = auth.uid()));

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists songs_set_updated_at on public.songs;
create trigger songs_set_updated_at before update on public.songs for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public) values ('audio', 'audio', false) on conflict (id) do update set public = excluded.public;

drop policy if exists "audio_owner_select" on storage.objects;
create policy "audio_owner_select" on storage.objects for select using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "audio_owner_insert" on storage.objects;
create policy "audio_owner_insert" on storage.objects for insert with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "audio_owner_update" on storage.objects;
create policy "audio_owner_update" on storage.objects for update using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "audio_owner_delete" on storage.objects;
create policy "audio_owner_delete" on storage.objects for delete using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
