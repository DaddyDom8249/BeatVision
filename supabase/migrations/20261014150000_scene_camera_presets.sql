-- REQUIRES MANUAL APPLY: not applied to any live database by this PR.
--
-- Per-scene camera-move preset selection for the Motion stage. A separate table
-- because visual_plan_scenes is immutable once the plan is approved. The
-- generation controller reads this row (DB authoritative) when it builds a
-- scene_motion payload. It never touches approved assets or job state.

create table if not exists public.scene_camera_presets (
  scene_id uuid primary key references public.visual_plan_scenes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  preset text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scene_camera_presets_preset_valid check (preset in (
    'static','push_in','pull_out','pan_left','pan_right','tilt_up','tilt_down','orbit','whip_pan'
  ))
);

create index if not exists scene_camera_presets_project_idx on public.scene_camera_presets(project_id);

-- The scene must belong to the same project as the row claims.
create or replace function public.scene_camera_presets_check_project()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.visual_plan_scenes s where s.id = new.scene_id and s.project_id = new.project_id) then
    raise exception 'SCENE_CAMERA_PRESET_PROJECT_MISMATCH';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists scene_camera_presets_check_project on public.scene_camera_presets;
create trigger scene_camera_presets_check_project
before insert or update on public.scene_camera_presets
for each row execute function public.scene_camera_presets_check_project();

alter table public.scene_camera_presets enable row level security;
revoke all on table public.scene_camera_presets from anon, authenticated;
grant select, insert, update on table public.scene_camera_presets to authenticated;

drop policy if exists "scene_camera_presets_owner_select" on public.scene_camera_presets;
create policy "scene_camera_presets_owner_select" on public.scene_camera_presets
for select to authenticated
using (exists (select 1 from public.projects p where p.id = scene_camera_presets.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "scene_camera_presets_owner_insert" on public.scene_camera_presets;
create policy "scene_camera_presets_owner_insert" on public.scene_camera_presets
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = scene_camera_presets.project_id and p.owner_id = (select auth.uid())));

drop policy if exists "scene_camera_presets_owner_update" on public.scene_camera_presets;
create policy "scene_camera_presets_owner_update" on public.scene_camera_presets
for update to authenticated
using (exists (select 1 from public.projects p where p.id = scene_camera_presets.project_id and p.owner_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = scene_camera_presets.project_id and p.owner_id = (select auth.uid())));
