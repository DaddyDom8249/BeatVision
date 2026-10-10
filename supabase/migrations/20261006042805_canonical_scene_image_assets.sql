create table if not exists public.scene_image_assets (
id uuid primary key default gen_random_uuid(),
project_id uuid not null references public.projects(id) on delete cascade,
visual_plan_id uuid not null references public.visual_plans(id) on delete restrict,
scene_id uuid not null references public.visual_plan_scenes(id) on delete restrict,
generation_job_id uuid not null references public.generation_jobs(id) on delete restrict,
provider text not null,
model text not null,
image_url text not null,
status text not null default 'generated' check (status in ('generated','approved','rejected')),
approved boolean not null default false,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
constraint scene_image_assets_job_unique unique (generation_job_id),
constraint scene_image_assets_lineage_unique unique (scene_id,generation_job_id)
);
create index if not exists scene_image_assets_project_scene_idx on public.scene_image_assets(project_id,scene_id,created_at);
create index if not exists scene_image_assets_project_status_idx on public.scene_image_assets(project_id,status,created_at);
alter table public.scene_image_assets enable row level security;
revoke insert,update,delete on public.scene_image_assets from anon,authenticated;
