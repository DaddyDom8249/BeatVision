
-- Add review-change columns to visual_world_reports
ALTER TABLE visual_world_reports
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to storyboard_scenes
ALTER TABLE storyboard_scenes
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to character_environments
ALTER TABLE character_environments
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to world_style_bibles
ALTER TABLE world_style_bibles
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to character_sheets
ALTER TABLE character_sheets
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to environment_sheets
ALTER TABLE environment_sheets
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to scene_visual_prompts
ALTER TABLE scene_visual_prompts
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Add review-change columns to scene_images
ALTER TABLE scene_images
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_after_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;

-- Create project_change_log table
CREATE TABLE project_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  section_type text NOT NULL,
  section_record_id text,
  change_type text NOT NULL,
  change_summary text,
  affected_sections text[] DEFAULT '{}',
  user_choice text,
  review_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for project_change_log
ALTER TABLE project_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their project change logs"
  ON project_change_log FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their project change logs"
  ON project_change_log FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Enable realtime for project_change_log
ALTER PUBLICATION supabase_realtime ADD TABLE project_change_log;
