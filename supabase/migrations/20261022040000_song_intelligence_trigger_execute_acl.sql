-- Security follow-up for BragoraForge Song Intelligence.
-- Revoke inherited PUBLIC EXECUTE on two trigger-only SECURITY DEFINER functions.
-- No data updates, destructive DDL, provider calls, or production deployment.
begin;
revoke all on function public.enforce_new_vision_lock_interpretation()
  from public, anon, authenticated;
revoke all on function public.reject_unlineaged_new_generation()
  from public, anon, authenticated;
grant execute on function public.enforce_new_vision_lock_interpretation()
  to service_role;
grant execute on function public.reject_unlineaged_new_generation()
  to service_role;
commit;
