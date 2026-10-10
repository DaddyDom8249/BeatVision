-- TRUNCATE bypasses both row-level security and row DELETE/approval triggers.
-- Remove only application-client bulk deletion authority, preserving owner CRUD,
-- service-role access, administrator privileges and every persisted row.
revoke truncate on all tables in schema public from public, anon, authenticated;

-- Application migrations in production run as postgres. Keep future application
-- tables safe without assuming authority over Supabase-managed creator roles.
alter default privileges for role postgres in schema public
  revoke truncate on tables from public, anon, authenticated;

-- Supabase-admin defaults belong to a separate privileged role and are not
-- modified by this application migration. Existing public tables are covered.
