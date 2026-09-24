REVOKE ALL ON FUNCTION public.touch_generation_run_updated_at() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_generation_run_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.beatvision_project_owner(uuid) FROM anon;