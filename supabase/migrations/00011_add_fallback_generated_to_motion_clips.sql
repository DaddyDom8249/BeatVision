
-- Add fallback_generated flag to motion_clips
ALTER TABLE motion_clips ADD COLUMN IF NOT EXISTS fallback_generated boolean NOT NULL DEFAULT false;

-- Add pending/failed/needs_review columns to motion_clips for cleanup workflow
ALTER TABLE motion_clips ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;
ALTER TABLE motion_clips ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false;
ALTER TABLE motion_clips ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE motion_clips ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false;

-- Add pending/failed columns to scene_motion_plans for cleanup workflow
ALTER TABLE scene_motion_plans ADD COLUMN IF NOT EXISTS pending boolean NOT NULL DEFAULT false;
ALTER TABLE scene_motion_plans ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false;
ALTER TABLE scene_motion_plans ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE scene_motion_plans ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false;

-- Ensure motion_settings has approved column
ALTER TABLE motion_settings ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;
