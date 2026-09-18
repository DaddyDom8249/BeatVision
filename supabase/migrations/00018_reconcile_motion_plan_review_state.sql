-- Reconcile motion plan review state used by the production motion workflow.
alter table public.scene_motion_plans add column if not exists pending boolean not null default false;
alter table public.scene_motion_plans add column if not exists failed boolean not null default false;
alter table public.scene_motion_plans add column if not exists rejected boolean not null default false;
alter table public.scene_motion_plans add column if not exists needs_review boolean not null default false;
alter table public.scene_motion_plans add column if not exists updated_after_approval boolean not null default false;
alter table public.scene_motion_plans add column if not exists last_approved_at timestamptz;