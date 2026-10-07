-- Persist a durable Supabase Storage path for generated scene images.
-- External provider URLs remain supported; fallback images use visual-assets storage
-- so signed URLs can be refreshed for later motion generation.
alter table public.scene_image_assets
  add column if not exists storage_path text;

create index if not exists scene_image_assets_storage_path_idx
  on public.scene_image_assets(storage_path)
  where storage_path is not null;
