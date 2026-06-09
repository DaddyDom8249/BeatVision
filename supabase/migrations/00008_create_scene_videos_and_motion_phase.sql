
-- video generation status enum
CREATE TYPE video_generation_status AS ENUM (
  'pending',
  'submitted',
  'processing',
  'succeed',
  'failed'
);

-- Add motion/video status values to project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Generating Motion';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion In Review';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion Approved';

-- scene_videos: one video per approved scene image
CREATE TABLE scene_videos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_image_id        uuid NOT NULL REFERENCES scene_images(id) ON DELETE CASCADE,
  scene_number          integer NOT NULL,
  scene_title           text,

  -- Kling task tracking
  task_id               text,
  generation_status     video_generation_status NOT NULL DEFAULT 'pending',
  task_status_msg       text,

  -- Video output
  video_url             text,
  duration              text,

  -- Approval state
  approved              boolean NOT NULL DEFAULT false,
  rejected              boolean NOT NULL DEFAULT false,
  needs_review          boolean NOT NULL DEFAULT false,
  updated_after_approval boolean NOT NULL DEFAULT false,
  last_approved_at      text,

  -- Prompt snapshot used for generation
  prompt_used           text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Add motion approval flag to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS motion_approved boolean NOT NULL DEFAULT false;

-- Enable Realtime on scene_videos
ALTER PUBLICATION supabase_realtime ADD TABLE scene_videos;

-- RLS: project owners can read/write their own scene videos
ALTER TABLE scene_videos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION can_access_scene_video(p_project_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND owner_id = auth.uid()
  );
$$;

CREATE POLICY "owners_select_scene_videos" ON scene_videos
  FOR SELECT USING (can_access_scene_video(project_id));

CREATE POLICY "owners_insert_scene_videos" ON scene_videos
  FOR INSERT WITH CHECK (can_access_scene_video(project_id));

CREATE POLICY "owners_update_scene_videos" ON scene_videos
  FOR UPDATE USING (can_access_scene_video(project_id));

CREATE POLICY "owners_delete_scene_videos" ON scene_videos
  FOR DELETE USING (can_access_scene_video(project_id));
