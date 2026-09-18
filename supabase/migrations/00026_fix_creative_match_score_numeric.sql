-- Store BeatVision creative match scores as normalized decimal values (0.0-1.0).
-- The generation contract emits values such as 0.92, so integer storage truncates the contract and rejects valid reports.
ALTER TABLE public.visual_world_reports
  ALTER COLUMN creative_match_score TYPE numeric(4,3)
  USING CASE
    WHEN creative_match_score IS NULL THEN NULL
    WHEN creative_match_score > 1 THEN creative_match_score / 100.0
    ELSE creative_match_score::numeric
  END;

ALTER TABLE public.visual_world_reports
  DROP CONSTRAINT IF EXISTS visual_world_reports_creative_match_score_range;

ALTER TABLE public.visual_world_reports
  ADD CONSTRAINT visual_world_reports_creative_match_score_range
  CHECK (creative_match_score IS NULL OR (creative_match_score >= 0 AND creative_match_score <= 1));
