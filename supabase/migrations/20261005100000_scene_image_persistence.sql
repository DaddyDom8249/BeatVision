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
  constraint scene_images_lineage_unique unique (scene_id, generation_job_id)
);

create index if not exists scene_images_project_scene_idx
  on public.scene_images(project_id, scene_id, created_at);

create index if not exists scene_images_project_status_idx
  on public.scene_images(project_id, status, created_at);

create or replace function public.enforce_scene_image_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  plan_project_id uuid;
  scene_project_id uuid;
  scene_plan_id uuid;
  job_project_id uuid;
  job_scene_id uuid;
  job_status text;
begin
  select vp.project_id
    into plan_project_id
    from public.visual_plans vp
   where vp.id = new.visual_plan_id;

  select s.project_id, s.visual_plan_id
    into scene_project_id, scene_plan_id
    from public.visual_plan_scenes s
   where s.id = new.scene_id;

  select gj.project_id, gj.visual_plan_scene_id, gj.status
    into job_project_id, job_scene_id, job_status
    from public.generation_jobs gj
   where gj.id = new.generation_job_id;

  if plan_project_id is null
     or scene_project_id is null
     or job_project_id is null
     or plan_project_id <> new.project_id
     or scene_project_id <> new.project_id
     or job_project_id <> new.project_id
     or scene_plan_id <> new.visual_plan_id
     or job_scene_id <> new.scene_id
     or job_status not in ('processing', 'completed') then
    raise exception 'SCENE_IMAGE_LINEAGE_INVALID'
      using errcode = '23514',
            detail = 'Scene image must belong to the same project/Visual Plan/Scene as a completed Generation Job.';
  end if;

  return new;
end;
$$;

drop trigger if exists scene_images_lineage on public.scene_images;
create trigger scene_images_lineage
before insert or update on public.scene_images
for each row execute function public.enforce_scene_image_lineage;

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
