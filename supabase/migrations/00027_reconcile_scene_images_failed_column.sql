-- Reconcile production drift: scene_images generation handlers use the failed state flag.
-- Keep this idempotent so environments missing the column are repaired safely.
ALTER TABLE public.scene_images
  ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
