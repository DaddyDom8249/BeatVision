alter table public.visual_world_reports
  alter column creative_match_score set default 0.94;

drop policy if exists "project_change_log_owner_insert" on public.project_change_log;
drop policy if exists "project_change_log_owner_select" on public.project_change_log;
create policy "project_change_log_owner_insert"
  on public.project_change_log
  for insert to authenticated
  with check (public.beatvision_project_owner(project_id));
create policy "project_change_log_owner_select"
  on public.project_change_log
  for select to authenticated
  using (public.beatvision_project_owner(project_id));

drop policy if exists "scene_videos_owner_all" on public.scene_videos;
create policy "scene_videos_owner_all"
  on public.scene_videos
  for all to authenticated
  using (public.beatvision_project_owner(project_id))
  with check (public.beatvision_project_owner(project_id));

drop policy if exists "scene_image_versions_owner_all" on public.scene_image_versions;
create policy "scene_image_versions_owner_all"
  on public.scene_image_versions
  for all to authenticated
  using (
    exists (
      select 1
      from public.scene_images si
      where si.id = scene_image_versions.scene_image_id
        and public.beatvision_project_owner(si.project_id)
    )
  )
  with check (
    exists (
      select 1
      from public.scene_images si
      where si.id = scene_image_versions.scene_image_id
        and public.beatvision_project_owner(si.project_id)
    )
  );
