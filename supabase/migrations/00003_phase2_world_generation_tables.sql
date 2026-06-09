
-- Extend projects table with Phase 2 approval flags and expanded status
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS style_bible_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS character_sheet_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS environment_sheet_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scene_prompts_approved boolean NOT NULL DEFAULT false;

-- World Style Bible
CREATE TABLE world_style_bibles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  overall_visual_style text,
  color_rules text,
  lighting_rules text,
  camera_rules text,
  character_consistency_rules text,
  environment_rules text,
  symbolic_motifs text,
  things_to_avoid text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE world_style_bibles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_world_style_bibles" ON world_style_bibles
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Character Sheets
CREATE TABLE character_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_role text,
  appearance text,
  wardrobe text,
  body_language text,
  facial_expression text,
  personality_energy text,
  recurring_visual_traits text,
  consistency_notes text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE character_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_character_sheets" ON character_sheets
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Environment Sheets
CREATE TABLE environment_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  main_world_description text,
  key_locations text,
  weather_atmosphere text,
  textures_materials text,
  background_details text,
  lighting_conditions text,
  recurring_objects text,
  world_consistency_rules text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE environment_sheets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_environment_sheets" ON environment_sheets
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Scene Visual Prompts
CREATE TABLE scene_visual_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storyboard_scene_id uuid REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
  scene_number integer NOT NULL,
  scene_title text,
  timestamp_range text,
  main_image_prompt text,
  camera_framing text,
  lighting_direction text,
  character_placement text,
  mood text,
  environment_details text,
  symbolic_objects text,
  style_consistency_notes text,
  negative_prompt text,
  approved boolean NOT NULL DEFAULT false,
  preview_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE scene_visual_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_scene_visual_prompts" ON scene_visual_prompts
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Scene Previews
CREATE TABLE scene_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_visual_prompt_id uuid REFERENCES scene_visual_prompts(id) ON DELETE SET NULL,
  preview_title text,
  preview_description text,
  dominant_colors text,
  mood text,
  location text,
  symbolic_object text,
  camera_direction text,
  placeholder_visual text,
  image_url text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE scene_previews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_all_scene_previews" ON scene_previews
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE world_style_bibles;
ALTER PUBLICATION supabase_realtime ADD TABLE character_sheets;
ALTER PUBLICATION supabase_realtime ADD TABLE environment_sheets;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_visual_prompts;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_previews;
