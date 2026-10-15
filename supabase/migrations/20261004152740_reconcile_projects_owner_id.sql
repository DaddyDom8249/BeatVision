alter table public.projects
  alter column owner_id set not null;

create index if not exists projects_owner_id_idx on public.projects(owner_id);

drop policy if exists "projects_owner_select" on public.projects;
drop policy if exists "projects_owner_insert" on public.projects;
drop policy if exists "projects_owner_update" on public.projects;
drop policy if exists "projects_owner_delete" on public.projects;

create policy "projects_owner_select" on public.projects
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "projects_owner_insert" on public.projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create policy "projects_owner_update" on public.projects
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "projects_owner_delete" on public.projects
  for delete to authenticated using ((select auth.uid()) = owner_id);
