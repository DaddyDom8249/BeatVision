-- Remove duplicate permissive debug-trace policies.
-- The retained policies are "debug trace insert own projects" and
-- "debug trace select own projects".
drop policy if exists "Users can insert own project debug traces" on public.project_debug_trace_events;
drop policy if exists "Users can read own project debug traces" on public.project_debug_trace_events;
