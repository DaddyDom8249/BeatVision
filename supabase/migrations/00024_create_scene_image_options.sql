CREATE TABLE public.scene_image_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_image_id uuid NOT NULL REFERENCES public.scene_images(id) ON DELETE CASCADE,
  owner_id uuid,
  option_index integer,
  source_type text NOT NULL DEFAULT 'manual_upload',
  image_url text,
  storage_path text,
  provider text DEFAULT 'manual_upload',
  prompt_text text,
  reference_image_url text,
  status text NOT NULL DEFAULT 'ready',
  selected boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scene_image_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_scene_image_options" ON public.scene_image_options
  FOR ALL TO authenticated
  USING (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()))
  WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE owner_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.scene_image_options;