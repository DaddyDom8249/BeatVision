-- Reconcile scene image metadata used by the Arena-backed image pipeline.
alter table public.scene_images add column if not exists timestamp_range text;
alter table public.scene_images add column if not exists thumbnail_url text;
alter table public.scene_images add column if not exists prompt_used text;
alter table public.scene_images add column if not exists prompt_summary text;
alter table public.scene_images add column if not exists mood text;
alter table public.scene_images add column if not exists camera_framing text;
alter table public.scene_images add column if not exists location text;
alter table public.scene_images add column if not exists character_presence text;
alter table public.scene_images add column if not exists lighting_direction text;
alter table public.scene_images add column if not exists style_consistency_summary text;
alter table public.scene_images add column if not exists provider_request jsonb;
alter table public.scene_images add column if not exists provider_response jsonb;
alter table public.scene_images add column if not exists active_version integer;