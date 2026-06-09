
-- scene_images table
CREATE TABLE scene_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storyboard_scene_id uuid REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
  scene_visual_prompt_id uuid REFERENCES scene_visual_prompts(id) ON DELETE SET NULL,
  scene_number integer NOT NULL,
  scene_title text,
  timestamp_range text,
  image_url text,
  thumbnail_url text,
  prompt_used text,
  prompt_summary text,
  mood text,
  camera_framing text,
  location text,
  character_presence text,
  lighting_direction text,
  style_consistency_summary text,
  generation_status text NOT NULL DEFAULT 'pending',
  approved boolean NOT NULL DEFAULT false,
  rejected boolean NOT NULL DEFAULT false,
  active_version integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- scene_image_versions table
CREATE TABLE scene_image_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_image_id uuid NOT NULL REFERENCES scene_images(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  image_url text,
  prompt_used text,
  notes text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- image_generation_batches table
CREATE TABLE image_generation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  total_scenes integer NOT NULL DEFAULT 0,
  generated_scenes integer NOT NULL DEFAULT 0,
  approved_scenes integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add Phase 3 columns to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS images_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_consistency_character boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_consistency_environment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_consistency_style boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_consistency_storyboard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_allow_variation boolean NOT NULL DEFAULT false;

-- RLS
ALTER TABLE scene_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_image_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_generation_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_scene_images" ON scene_images
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

CREATE POLICY "owner_all_scene_image_versions" ON scene_image_versions
  FOR ALL TO authenticated
  USING (scene_image_id IN (SELECT id FROM scene_images WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())))
  WITH CHECK (scene_image_id IN (SELECT id FROM scene_images WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())));

CREATE POLICY "owner_all_image_generation_batches" ON image_generation_batches
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE scene_images;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_image_versions;
ALTER PUBLICATION supabase_realtime ADD TABLE image_generation_batches;
