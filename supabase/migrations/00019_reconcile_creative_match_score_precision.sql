-- The column is numeric(4,3), so creative_match_score is stored as a 0..1 ratio.
alter table public.visual_world_reports
  drop constraint if exists visual_world_reports_creative_match_score_range;

alter table public.visual_world_reports
  add constraint visual_world_reports_creative_match_score_range
  check (
    creative_match_score is null
    or (creative_match_score >= 0 and creative_match_score <= 1)
  );
