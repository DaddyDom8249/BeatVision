
-- Add rejected + last_approved_at to scene_motion_plans
ALTER TABLE scene_motion_plans
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add rejected + last_approved_at + error_message + status to motion_clips
ALTER TABLE motion_clips
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS status motion_clip_status NOT NULL DEFAULT 'not_generated';

-- Add Preview Render Ready / Final Render Ready / Render Failed to project_status enum (safe)
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Preview Render Ready';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Final Render Ready';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Render Failed';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion Plans Approved';
