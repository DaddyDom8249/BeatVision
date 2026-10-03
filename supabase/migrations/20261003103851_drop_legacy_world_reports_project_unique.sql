-- Revisioned World reports must allow multiple immutable revisions per project.
-- The original one-row-per-project unique constraint conflicts with the
-- (project_id, revision_number) revision model and makes revision 2 impossible.
alter table public.world_reports
  drop constraint if exists world_reports_project_unique;
