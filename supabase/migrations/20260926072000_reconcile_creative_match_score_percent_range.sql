-- BeatVision stores Creative Match Score as a 0-100 percentage.
-- Drop the legacy 0-1 constraint BEFORE changing the column so existing
-- percentage values cannot make the ALTER fail during the transition.
ALTER TABLE public.visual_world_reports
  DROP CONSTRAINT IF EXISTS visual_world_reports_creative_match_score_range;

ALTER TABLE public.visual_world_reports
  ALTER COLUMN creative_match_score TYPE numeric(5,2)
  USING CASE
    WHEN creative_match_score IS NULL THEN NULL
    WHEN creative_match_score <= 1 THEN creative_match_score * 100
    ELSE creative_match_score
  END;

ALTER TABLE public.visual_world_reports
  ADD CONSTRAINT visual_world_reports_creative_match_score_range
  CHECK (
    creative_match_score IS NULL
    OR (creative_match_score >= 0 AND creative_match_score <= 100)
  );

NOTIFY pgrst, 'reload schema';
