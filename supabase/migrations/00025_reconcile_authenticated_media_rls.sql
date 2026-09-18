-- Keep project-owned production media policies authenticated-only.
drop policy if exists final_videos_owner_all on public.final_videos;
create policy final_videos_owner_all on public.final_videos
for all to authenticated
using (public.beatvision_project_owner(project_id))
with check (public.beatvision_project_owner(project_id));

drop policy if exists motion_clips_owner_all on public.motion_clips;
create policy motion_clips_owner_all on public.motion_clips
for all to authenticated
using (public.beatvision_project_owner(project_id))
with check (public.beatvision_project_owner(project_id));

drop policy if exists motion_settings_owner_all on public.motion_settings;
create policy motion_settings_owner_all on public.motion_settings
for all to authenticated
using (public.beatvision_project_owner(project_id))
with check (public.beatvision_project_owner(project_id));

drop policy if exists scene_motion_plans_owner_all on public.scene_motion_plans;
create policy scene_motion_plans_owner_all on public.scene_motion_plans
for all to authenticated
using (public.beatvision_project_owner(project_id))
with check (public.beatvision_project_owner(project_id));

drop policy if exists video_render_jobs_owner_all on public.video_render_jobs;
create policy video_render_jobs_owner_all on public.video_render_jobs
for all to authenticated
using (public.beatvision_project_owner(project_id))
with check (public.beatvision_project_owner(project_id));
