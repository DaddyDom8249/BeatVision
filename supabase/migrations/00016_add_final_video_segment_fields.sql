
-- Add segment_count and render_manifest_url to final_videos
ALTER TABLE final_videos
  ADD COLUMN segment_count integer,
  ADD COLUMN render_manifest_url text;
