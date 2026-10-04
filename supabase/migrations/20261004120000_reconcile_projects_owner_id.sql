-- BeatVision: reconcile projects ownership around owner_id.
-- Production audit 2026-10-04 confirmed public.projects has owner_id populated
-- for all 27 rows and no legacy user_id column. Do not attempt a user_id backfill.
-- This migration codifies the already-live owner_id authority and reasserts
-- owner-scoped project policies without destructive column removal.

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

-- Child-table ownership policies already use projects.owner_id in production.
-- No legacy user_id references are introduced by this migration.
