-- Safely create all required storage buckets for BeatVision.
-- ON CONFLICT (id) DO NOTHING makes this idempotent:
--   · Fresh project  → all 3 buckets are created.
--   · Existing project where earlier migrations already inserted them → no error.

INSERT INTO storage.buckets (id, name, public)
VALUES ('songs', 'songs', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('scene-images', 'scene-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('render-manifests', 'render-manifests', true)
ON CONFLICT (id) DO NOTHING;