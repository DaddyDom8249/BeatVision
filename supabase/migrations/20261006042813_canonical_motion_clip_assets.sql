create table if not exists public.motion_clip_assets (
id uuid primary key default gen_random_uuid(),
project_id uuid not null references public.projects(id) on delete cascade,
visual_plan_id uuid not null references public.visual_plans(id) on delete restrict,
scene_id uuid not null references public.visual_plan_scenes(id) on delete restrict,
generation_job_id uuid not null references public.generation_jobs(id) on delete restrict,
scene_image_id uuid references public.scene_image_assets(id) on delete restrict,
provider text not null,
model text not null,
video_url text not null,
status text not null default 'generated' check(status in ('generated','approved','rejected')),
approved boolean not null default false,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
constraint motion_clip_assets_job_unique unique(generation_job_id)
);
create index if not exists motion_clip_assets_project_scene_idx on public.motion_clip_assets(project_id,scene_id,created_at);
create index if not exists motion_clip_assets_project_status_idx on public.motion_clip_assets(project_id,status,created_at);
alter table public.motion_clip_assets enable row level security;
revoke insert,update,delete on public.motion_clip_assets from anon,authenticated;
