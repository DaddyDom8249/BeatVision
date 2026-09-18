-- Reconcile scene prompt review state used by the production review workflow.
alter table public.scene_visual_prompts add column if not exists needs_review boolean not null default false;
alter table public.scene_visual_prompts add column if not exists updated_after_approval boolean not null default false;
alter table public.scene_visual_prompts add column if not exists last_approved_at timestamptz;