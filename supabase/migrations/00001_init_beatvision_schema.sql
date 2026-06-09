
-- Profiles and auth
CREATE TYPE public.user_role AS ENUM ('user', 'admin');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  email text,
  phone text,
  role public.user_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_role(uid uuid)
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.phone,
    'user'::public.user_role
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

CREATE POLICY "Admins have full access to profiles" ON profiles
  FOR ALL TO authenticated USING (get_user_role(auth.uid()) = 'admin'::user_role);

CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id)
  WITH CHECK (role IS NOT DISTINCT FROM get_user_role(auth.uid()));

CREATE VIEW public_profiles AS
  SELECT id, username, role FROM profiles;

-- Projects
CREATE TYPE public.project_status AS ENUM (
  'Draft',
  'World Approved',
  'Storyboard Approved',
  'Ready for Generation'
);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  song_file text,
  song_file_name text,
  lyrics text,
  selected_style text NOT NULL DEFAULT 'Cinematic',
  optional_notes text,
  status public.project_status NOT NULL DEFAULT 'Draft',
  world_approved boolean NOT NULL DEFAULT false,
  storyboard_approved boolean NOT NULL DEFAULT false,
  characters_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own projects" ON projects
  FOR ALL TO authenticated USING (auth.uid() = owner_id);

-- Visual World Reports
CREATE TABLE public.visual_world_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  song_summary text,
  emotional_core text,
  main_visual_world text,
  color_palette text,
  lighting_style text,
  main_characters text,
  symbolic_objects text,
  key_locations text,
  story_direction text,
  creative_match_score integer DEFAULT 0,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.visual_world_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own world reports" ON visual_world_reports
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Storyboard Scenes
CREATE TABLE public.storyboard_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_number integer NOT NULL,
  timestamp_range text,
  scene_title text,
  visual_description text,
  camera_direction text,
  mood text,
  location text,
  lyric_moment text,
  transition_style text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storyboard_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own storyboard scenes" ON storyboard_scenes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Character and Environment
CREATE TABLE public.character_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  main_character text,
  supporting_character text,
  main_environment text,
  visual_atmosphere text,
  wardrobe_style text,
  world_rules text,
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.character_environments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own character environments" ON character_environments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));

-- Beta Feedback
CREATE TABLE public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  understanding_score integer,
  world_accuracy_score integer,
  gave_new_ideas boolean,
  trust_to_generate_video boolean,
  what_felt_right text,
  what_felt_wrong_or_missing text,
  what_would_change text,
  would_use_again boolean,
  would_recommend boolean,
  final_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can submit and view own feedback" ON beta_feedback
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert feedback" ON beta_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Creator Memory
CREATE TABLE public.creator_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  favorite_styles text[],
  recurring_themes text[],
  preferred_colors text[],
  preferred_worlds text[],
  character_preferences text,
  storytelling_patterns text,
  past_project_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own creator memory" ON creator_memory
  FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Enable realtime for projects
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE visual_world_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE storyboard_scenes;
ALTER PUBLICATION supabase_realtime ADD TABLE character_environments;
