-- BeatVision canonical scene-image persistence.
-- A completed scene-image generation job must produce one authoritative
-- production asset linked to the exact approved Scene Direction.

begin;

create table if not exists public.scene_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  visual_plan_id uuid not null references public.visual_plans(id) on delete restrict,
  scene_id uuid not null references public.visual_plan_scenes(id) on delete restrict,
  generation_job_id uuid not null references public.generation_jobs(id) on delete restrict,
  provider text not null,
  model text not null,
  image_url text not null,
  status text not null default 'generated'
    check (status in ('generated','approved','rejected')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint scene_images_job_unique unique (generation_job_id),
  constraint scene_images_lineage_unique unique (scene_id, generation_job_id),
  constraint scene_images_lineage_fk
    foreign key (visual_plan_id, project_id)
    references public.visual_plans(id, project_id)
    on delete restrict,
  constraint scene_images_scene_lineage_fk
    foreign key (scene_id, project_id, visual_plan_id)
    references public.visual_plan_scenes(id, project_id, visual_plan_id)
    on delete restrict
);

create index if not exists scene_images_project_scene_idx
  on public.scene_images(project_id, scene_id, created_at);

create index if not exists scene_images_project_status_idx
  on public.scene_images(project_id, status, created_at);

create or replace function public.set_scene_images_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scene_images_updated_at on public.scene_images;
create trigger scene_images_updated_at
before update on public.scene_images
for each row execute function public.set_scene_images_updated_at();

alter table public.scene_images enable row level security;

drop policy if exists scene_images_owner_select on public.scene_images;
create policy scene_images_owner_select
on public.scene_images
for select
to authenticated
using (
  exists (
    select 1
      from public.projects p
     where p.id = scene_images.project_id
       and p.owner_id = auth.uid()
  )
);

revoke insert, update, delete on public.scene_images from anon, authenticated;

commit;
