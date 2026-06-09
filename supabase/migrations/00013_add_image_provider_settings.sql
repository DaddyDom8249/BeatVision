
-- Image provider settings table
CREATE TABLE image_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  real_ai_providers_enabled boolean NOT NULL DEFAULT false,
  provider_name text NOT NULL DEFAULT 'Manual Upload Only',
  api_key text,
  api_endpoint text,
  model_name text,
  output_size text,
  aspect_ratio text NOT NULL DEFAULT '16:9',
  enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

ALTER TABLE image_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_image_provider_settings" ON image_provider_settings
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );
