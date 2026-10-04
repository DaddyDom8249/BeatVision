-- Canonical project ownership and analysis schema reconciliation.
-- The application and later migrations use owner_id. Older Phase 1 used user_id.
-- This migration is safe for both a fresh database and the repaired production shape.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'owner_id'
  ) then
    alter table public.projects rename column user_id to owner_id;
  end if;
end $$;

alter table public.projects
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists stage text not null default 'song',
  add column if not exists song_duration double precision;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'owner_id'
  ) then
    if exists (select 1 from public.projects where owner_id is null) then
      raise exception 'PROJECT_OWNER_MISSING';
    end if;
    alter table public.projects alter column owner_id set not null;
  end if;
end $$;

create index if not exists projects_owner_id_idx on public.projects(owner_id);

drop policy if exists "projects_owner_select" on public.projects;
create policy "projects_owner_select" on public.projects
for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "projects_owner_insert" on public.projects;
create policy "projects_owner_insert" on public.projects
for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "projects_owner_update" on public.projects;
create policy "projects_owner_update" on public.projects
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "projects_owner_delete" on public.projects;
create policy "projects_owner_delete" on public.projects
for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "songs_owner_select" on public.songs;
create policy "songs_owner_select" on public.songs
for select to authenticated
using (exists (select 1 from public.projects p where p.id = songs.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "songs_owner_insert" on public.songs;
create policy "songs_owner_insert" on public.songs
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = songs.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "songs_owner_update" on public.songs;
create policy "songs_owner_update" on public.songs
for update to authenticated
using (exists (select 1 from public.projects p where p.id = songs.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = songs.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "songs_owner_delete" on public.songs;
create policy "songs_owner_delete" on public.songs
for delete to authenticated
using (exists (select 1 from public.projects p where p.id = songs.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "world_reports_owner_select" on public.world_reports;
create policy "world_reports_owner_select" on public.world_reports
for select to authenticated
using (exists (select 1 from public.projects p where p.id = world_reports.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "world_reports_owner_insert" on public.world_reports;
create policy "world_reports_owner_insert" on public.world_reports
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = world_reports.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "world_reports_owner_update" on public.world_reports;
create policy "world_reports_owner_update" on public.world_reports
for update to authenticated
using (exists (select 1 from public.projects p where p.id = world_reports.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = world_reports.project_id and p.owner_id = (select auth.uid())));

do $$
declare
  table_name text;
  policy_record record;
begin
  for table_name in
    select unnest(array['style_bibles','characters','character_assets','environments','environment_assets'])
  loop
    for policy_record in
      select policyname, cmd, qual, with_check
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;
  end loop;
end $$;

create policy "style_bibles_owner_select" on public.style_bibles
for select to authenticated
using (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.owner_id = (select auth.uid())));
create policy "style_bibles_owner_insert" on public.style_bibles
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.owner_id = (select auth.uid())));
create policy "style_bibles_owner_update" on public.style_bibles
for update to authenticated
using (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.owner_id = (select auth.uid())));

create policy "characters_owner_select" on public.characters
for select to authenticated
using (exists (select 1 from public.projects p where p.id = characters.project_id and p.owner_id = (select auth.uid())));
create policy "characters_owner_insert" on public.characters
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = characters.project_id and p.owner_id = (select auth.uid())));
create policy "characters_owner_update" on public.characters
for update to authenticated
using (exists (select 1 from public.projects p where p.id = characters.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = characters.project_id and p.owner_id = (select auth.uid())));

create policy "character_assets_owner_select" on public.character_assets
for select to authenticated
using (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.owner_id = (select auth.uid())));
create policy "character_assets_owner_insert" on public.character_assets
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.owner_id = (select auth.uid())));
create policy "character_assets_owner_update" on public.character_assets
for update to authenticated
using (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.owner_id = (select auth.uid())));

create policy "environments_owner_select" on public.environments
for select to authenticated
using (exists (select 1 from public.projects p where p.id = environments.project_id and p.owner_id = (select auth.uid())));
create policy "environments_owner_insert" on public.environments
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = environments.project_id and p.owner_id = (select auth.uid())));
create policy "environments_owner_update" on public.environments
for update to authenticated
using (exists (select 1 from public.projects p where p.id = environments.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = environments.project_id and p.owner_id = (select auth.uid())));

create policy "environment_assets_owner_select" on public.environment_assets
for select to authenticated
using (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.owner_id = (select auth.uid())));
create policy "environment_assets_owner_insert" on public.environment_assets
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.owner_id = (select auth.uid())));
create policy "environment_assets_owner_update" on public.environment_assets
for update to authenticated
using (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.owner_id = (select auth.uid())));

alter table public.songs
  add column if not exists analysis_status text not null default 'not_started'
    check (analysis_status in ('not_started','analyzing','completed','failed')),
  add column if not exists analysis jsonb,
  add column if not exists analyzed_at timestamptz;

create index if not exists songs_analysis_status_idx on public.songs(analysis_status);
