
-- Add real/uploaded/placeholder distinction fields to scene_images
ALTER TABLE scene_images
  ADD COLUMN real_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN manual_upload boolean NOT NULL DEFAULT false,
  ADD COLUMN placeholder boolean NOT NULL DEFAULT false,
  ADD COLUMN use_placeholder_as_draft_final boolean NOT NULL DEFAULT false,
  ADD COLUMN provider_name text,
  ADD COLUMN provider_request jsonb,
  ADD COLUMN provider_response jsonb;
