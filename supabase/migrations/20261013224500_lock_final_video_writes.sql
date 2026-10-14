-- Lock authoritative final-video rows to the server controller.
-- No existing media or final_videos rows are updated or deleted.
-- New authenticated viewers retain owner-scoped SELECT through RLS.
begin;
revoke insert, update, delete on table public.final_videos from public, anon, authenticated;
drop policy if exists final_videos_owner_all on public.final_videos;
drop policy if exists final_videos_owner_select on public.final_videos;
create policy final_videos_owner_select on public.final_videos
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = final_videos.project_id
      and p.owner_id = (select auth.uid())
    )
  );
grant select on table public.final_videos to authenticated;
grant all on table public.final_videos to service_role;
commit;
