-- Add pending and failed state columns to scene_images
-- These are written by approve/reject/generation handlers
ALTER TABLE scene_images
  ADD COLUMN IF NOT EXISTS pending  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS failed   boolean NOT NULL DEFAULT false;

-- Also ensure the generation_status column accepts all values used in code
-- (it is text, so all values are valid already)