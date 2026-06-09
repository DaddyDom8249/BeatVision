
-- Video segments table for full-length music video segmented renderer
CREATE TABLE video_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  segment_number integer NOT NULL DEFAULT 1,
  source_storyboard_scene_id uuid,
  source_scene_image_id uuid,
  start_time numeric NOT NULL DEFAULT 0,
  end_time numeric NOT NULL DEFAULT 10,
  duration numeric NOT NULL DEFAULT 10,
  segment_title text,
  image_url text,
  motion_effect text NOT NULL DEFAULT 'Slow Zoom In',
  transition_in text NOT NULL DEFAULT 'Fade',
  transition_out text NOT NULL DEFAULT 'Fade',
  caption_text text,
  lyric_text text,
  audio_start_time numeric,
  audio_end_time numeric,
  render_status text NOT NULL DEFAULT 'Not Rendered',
  video_url text,
  fallback_rendered boolean NOT NULL DEFAULT false,
  provider_rendered boolean NOT NULL DEFAULT false,
  simulated_preview boolean NOT NULL DEFAULT false,
  error_message text,
  approved boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  pending boolean NOT NULL DEFAULT false,
  failed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE video_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_video_segments" ON video_segments
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  );
