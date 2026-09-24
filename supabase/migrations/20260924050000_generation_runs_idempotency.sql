-- BeatVision production generation orchestration
-- Additive migration. No existing creative data is modified.

CREATE TYPE public.generation_run_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS public.generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action text NOT NULL,
  request_key text NOT NULL,
  status public.generation_run_status NOT NULL DEFAULT 'pending',
  provider text,
  model text,
  input_hash text NOT NULL,
  output_json jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT generation_runs_action_nonempty CHECK (length(trim(action)) > 0),
  CONSTRAINT generation_runs_request_key_nonempty CHECK (length(trim(request_key)) > 0),
  CONSTRAINT generation_runs_input_hash_nonempty CHECK (length(trim(input_hash)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS generation_runs_project_request_key_uq
  ON public.generation_runs(project_id, request_key);

CREATE INDEX IF NOT EXISTS generation_runs_project_created_idx
  ON public.generation_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_runs_project_action_status_idx
  ON public.generation_runs(project_id, action, status);

ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own generation runs" ON public.generation_runs;
CREATE POLICY "Users can manage own generation runs"
  ON public.generation_runs
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_generation_run_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generation_runs_touch_updated_at ON public.generation_runs;
CREATE TRIGGER generation_runs_touch_updated_at
  BEFORE UPDATE ON public.generation_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_generation_run_updated_at();

CREATE INDEX IF NOT EXISTS projects_owner_id_idx ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS visual_world_reports_project_created_idx ON public.visual_world_reports(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS storyboard_scenes_project_scene_idx ON public.storyboard_scenes(project_id, scene_number);
CREATE INDEX IF NOT EXISTS character_environments_project_created_idx ON public.character_environments(project_id, created_at DESC);
