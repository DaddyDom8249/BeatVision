begin;

create table if not exists public.motion_clips (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  visual_plan_id uuid not null references public.visual_plans(id) on delete restrict,
  scene_id uuid not null references public.visual_plan_scenes(id) on delete restrict,
  generation_job_id uuid not null references public.generation_jobs(id) on delete restrict,
  scene_image_id uuid references public.scene_images(id) on delete restrict,
  provider text not null,
  model text not null,
  video_url text not null,
  status text not null default 'generated'
    check (status in ('generated','approved','rejected')),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motion_clips_job_unique unique (generation_job_id)
);

create index if not exists motion_clips_project_scene_idx
  on public.motion_clips(project_id, scene_id, created_at);

create index if not exists motion_clips_project_status_idx
  on public.motion_clips(project_id, status, created_at);

create or replace function public.enforce_motion_clip_lineage()
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
  job_type text;
  job_status text;
  image_project_id uuid;
  image_scene_id uuid;
begin
  select vp.project_id into plan_project_id
    from public.visual_plans vp where vp.id = new.visual_plan_id;
  select s.project_id, s.visual_plan_id into scene_project_id, scene_plan_id
    from public.visual_plan_scenes s where s.id = new.scene_id;
  select gj.project_id, gj.visual_plan_scene_id, gj.job_type, gj.status
    into job_project_id, job_scene_id, job_type, job_status
    from public.generation_jobs gj where gj.id = new.generation_job_id;

  if new.scene_image_id is not null then
    select si.project_id, si.scene_id into image_project_id, image_scene_id
      from public.scene_images si where si.id = new.scene_image_id;
  end if;

  if plan_project_id is null
     or scene_project_id is null
     or job_project_id is null
     or plan_project_id <> new.project_id
     or scene_project_id <> new.project_id
     or job_project_id <> new.project_id
     or scene_plan_id <> new.visual_plan_id
     or job_scene_id <> new.scene_id
     or job_type <> 'scene_motion'
     or job_status <> 'completed'
     or (new.scene_image_id is not null and
         (image_project_id <> new.project_id or image_scene_id <> new.scene_id)) then
    raise exception 'MOTION_CLIP_LINEAGE_INVALID'
      using errcode = '23514',
            detail = 'Motion clip must belong to the same project/Visual Plan/Scene as a completed scene-motion Generation Job.';
  end if;
  return new;
end;
$$;

drop trigger if exists motion_clips_lineage on public.motion_clips;
create trigger motion_clips_lineage
before insert or update on public.motion_clips
for each row execute function public.enforce_motion_clip_lineage;

create or replace function public.set_motion_clips_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists motion_clips_updated_at on public.motion_clips;
create trigger motion_clips_updated_at
before update on public.motion_clips
for each row execute function public.set_motion_clips_updated_at;

alter table public.motion_clips enable row level security;

drop policy if exists motion_clips_owner_select on public.motion_clips;
create policy motion_clips_owner_select
on public.motion_clips
for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = motion_clips.project_id and p.owner_id = auth.uid()
  )
);

revoke insert, update, delete on public.motion_clips from anon, authenticated;

commit;
