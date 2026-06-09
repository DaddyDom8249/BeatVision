-- Change final_videos.render_status from enum to text so it can store
-- extended status values: 'Preview Ready', 'Browser Rendered', 'Manifest Only', etc.
-- The enum is kept intact for render_jobs which still uses it.
ALTER TABLE final_videos
  ALTER COLUMN render_status TYPE text
  USING render_status::text;

-- Set a sensible default so new rows don't need explicit status
ALTER TABLE final_videos
  ALTER COLUMN render_status SET DEFAULT 'pending';