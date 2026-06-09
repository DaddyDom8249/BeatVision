
-- ── Phase 4: Motion and Video Rendering ──────────────────────────────────────

-- 1. Extend project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion Settings Ready';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion Plan Ready';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion Clips In Review';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Motion Clips Approved';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'Final Video Rendered';

-- 2. motion_settings
CREATE TABLE motion_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  motion_style     text NOT NULL DEFAULT 'Cinematic Slow Push',
  transition_style text NOT NULL DEFAULT 'Fade',
  caption_style    text NOT NULL DEFAULT 'No Captions',
  video_format     text NOT NULL DEFAULT '16:9 Landscape',
  video_quality    text NOT NULL DEFAULT 'Standard 720p',
  add_beat_camera_movement boolean NOT NULL DEFAULT false,
  add_zoom_pan             boolean NOT NULL DEFAULT true,
  add_cinematic_grain      boolean NOT NULL DEFAULT false,
  add_scene_title_cards    boolean NOT NULL DEFAULT false,
  add_lyric_captions       boolean NOT NULL DEFAULT false,
  add_transition_effects   boolean NOT NULL DEFAULT true,
  keep_motion_gentle       boolean NOT NULL DEFAULT false,
  make_motion_intense      boolean NOT NULL DEFAULT false,
  approved         boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- 3. scene_motion_plans
CREATE TYPE motion_clip_status AS ENUM (
  'not_generated',
  'generating',
  'ready_for_review',
  'approved',
  'failed',
  'needs_regeneration'
);

CREATE TABLE scene_motion_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storyboard_scene_id  uuid REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
  scene_image_id       uuid REFERENCES scene_images(id) ON DELETE SET NULL,
  scene_number         integer NOT NULL,
  scene_title          text,
  timestamp_range      text,
  duration             numeric(6,2) DEFAULT 4.0,
  motion_effect        text NOT NULL DEFAULT 'Slow Zoom In',
  transition_in        text NOT NULL DEFAULT 'Fade',
  transition_out       text NOT NULL DEFAULT 'Fade',
  caption_text         text,
  lyric_moment         text,
  include_in_final_video boolean NOT NULL DEFAULT true,
  approved             boolean NOT NULL DEFAULT false,
  status               motion_clip_status NOT NULL DEFAULT 'not_generated',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- 4. motion_clips
CREATE TABLE motion_clips (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_motion_plan_id  uuid REFERENCES scene_motion_plans(id) ON DELETE SET NULL,
  storyboard_scene_id   uuid REFERENCES storyboard_scenes(id) ON DELETE SET NULL,
  scene_image_id        uuid REFERENCES scene_images(id) ON DELETE SET NULL,
  scene_number          integer NOT NULL,
  scene_title           text,
  clip_url              text,
  preview_url           text,
  duration              numeric(6,2),
  motion_effect         text NOT NULL DEFAULT 'Slow Zoom In',
  transition_in         text NOT NULL DEFAULT 'Fade',
  transition_out        text NOT NULL DEFAULT 'Fade',
  caption_text          text,
  generation_status     motion_clip_status NOT NULL DEFAULT 'not_generated',
  approved              boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 5. video_render_jobs
CREATE TYPE render_job_status AS ENUM (
  'pending',
  'running',
  'complete',
  'failed'
);

CREATE TYPE render_type AS ENUM (
  'preview',
  'final'
);

CREATE TABLE video_render_jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  render_type    render_type NOT NULL DEFAULT 'preview',
  status         render_job_status NOT NULL DEFAULT 'pending',
  video_format   text,
  video_quality  text,
  output_url     text,
  error_message  text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 6. final_videos
CREATE TABLE final_videos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             text,
  video_url         text,
  preview_video_url text,
  audio_file        text,
  duration          numeric(7,2),
  format            text,
  quality           text,
  render_status     render_job_status NOT NULL DEFAULT 'pending',
  downloadable      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 7. RLS policies
ALTER TABLE motion_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_motion_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE motion_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_videos ENABLE ROW LEVEL SECURITY;

-- Helper: owner check
CREATE OR REPLACE FUNCTION can_access_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND owner_id = auth.uid()
  );
$$;

-- motion_settings
CREATE POLICY "motion_settings_select" ON motion_settings FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "motion_settings_insert" ON motion_settings FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "motion_settings_update" ON motion_settings FOR UPDATE USING (can_access_project(project_id));
CREATE POLICY "motion_settings_delete" ON motion_settings FOR DELETE USING (can_access_project(project_id));

-- scene_motion_plans
CREATE POLICY "smp_select" ON scene_motion_plans FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "smp_insert" ON scene_motion_plans FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "smp_update" ON scene_motion_plans FOR UPDATE USING (can_access_project(project_id));
CREATE POLICY "smp_delete" ON scene_motion_plans FOR DELETE USING (can_access_project(project_id));

-- motion_clips
CREATE POLICY "mc_select" ON motion_clips FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "mc_insert" ON motion_clips FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "mc_update" ON motion_clips FOR UPDATE USING (can_access_project(project_id));
CREATE POLICY "mc_delete" ON motion_clips FOR DELETE USING (can_access_project(project_id));

-- video_render_jobs
CREATE POLICY "vrj_select" ON video_render_jobs FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "vrj_insert" ON video_render_jobs FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "vrj_update" ON video_render_jobs FOR UPDATE USING (can_access_project(project_id));
CREATE POLICY "vrj_delete" ON video_render_jobs FOR DELETE USING (can_access_project(project_id));

-- final_videos
CREATE POLICY "fv_select" ON final_videos FOR SELECT USING (can_access_project(project_id));
CREATE POLICY "fv_insert" ON final_videos FOR INSERT WITH CHECK (can_access_project(project_id));
CREATE POLICY "fv_update" ON final_videos FOR UPDATE USING (can_access_project(project_id));
CREATE POLICY "fv_delete" ON final_videos FOR DELETE USING (can_access_project(project_id));

-- 8. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE motion_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE scene_motion_plans;
ALTER PUBLICATION supabase_realtime ADD TABLE motion_clips;
ALTER PUBLICATION supabase_realtime ADD TABLE video_render_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE final_videos;
