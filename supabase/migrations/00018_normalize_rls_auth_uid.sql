-- Normalize auth.uid() calls in the public RLS policies.
-- Using a scalar subquery lets Postgres cache the auth lookup per statement.
alter policy "Users can manage own character environments" on public.character_environments
  using (exists (select 1 from public.projects p where p.id = character_environments.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = character_environments.project_id and p.owner_id = (select auth.uid())));

alter policy "owner_all_character_sheets" on public.character_sheets
  using (exists (select 1 from public.projects p where p.id = character_sheets.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = character_sheets.project_id and p.owner_id = (select auth.uid())));

alter policy "owner_all_environment_sheets" on public.environment_sheets
  using (exists (select 1 from public.projects p where p.id = environment_sheets.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = environment_sheets.project_id and p.owner_id = (select auth.uid())));

alter policy "owner_all_image_provider_settings" on public.image_provider_settings
  using (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())))
  with check (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())));

alter policy "Profiles insert own" on public.profiles with check ((select auth.uid()) = id);
alter policy "Profiles select own" on public.profiles using ((select auth.uid()) = id);
alter policy "Profiles update own" on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

alter policy "Users can delete own project debug traces" on public.project_debug_trace_events
  using (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_debug_trace_events.project_id and p.owner_id = (select auth.uid())));

alter policy "debug trace insert own projects" on public.project_debug_trace_events
  with check (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_debug_trace_events.project_id and p.owner_id = (select auth.uid())));

alter policy "debug trace select own projects" on public.project_debug_trace_events
  using (exists (select 1 from public.projects p where p.id = project_debug_trace_events.project_id and p.owner_id = (select auth.uid())));

alter policy "Projects delete own" on public.projects using ((select auth.uid()) = owner_id);
alter policy "Projects insert own" on public.projects with check ((select auth.uid()) = owner_id);
alter policy "Projects select own" on public.projects using ((select auth.uid()) = owner_id);
alter policy "Projects update own" on public.projects using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

alter policy "owner_all_scene_image_options" on public.scene_image_options
  using (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())))
  with check (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())));

alter policy "owner_all_scene_images" on public.scene_images
  using (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())))
  with check (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())));

alter policy "owner_all_scene_previews" on public.scene_previews
  using (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())))
  with check (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())));

alter policy "owner_all_scene_prompts" on public.scene_prompts
  using (exists (select 1 from public.projects p where p.id = scene_prompts.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = scene_prompts.project_id and p.owner_id = (select auth.uid())));

alter policy "owner_all_scene_visual_prompts" on public.scene_visual_prompts
  using (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())))
  with check (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())));

alter policy "Users can manage own storyboard scenes" on public.storyboard_scenes
  using (exists (select 1 from public.projects p where p.id = storyboard_scenes.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = storyboard_scenes.project_id and p.owner_id = (select auth.uid())));

alter policy "owner_all_video_segments" on public.video_segments
  using (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())))
  with check (project_id in (select projects.id from public.projects where projects.owner_id = (select auth.uid())));

alter policy "Users can manage own world reports" on public.visual_world_reports
  using (exists (select 1 from public.projects p where p.id = visual_world_reports.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = visual_world_reports.project_id and p.owner_id = (select auth.uid())));

alter policy "owner_all_world_style_bibles" on public.world_style_bibles
  using (exists (select 1 from public.projects p where p.id = world_style_bibles.project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = world_style_bibles.project_id and p.owner_id = (select auth.uid())));
