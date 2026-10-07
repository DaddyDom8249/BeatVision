create or replace function public.get_generation_scheduler_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select queue_secret
  from private.beatvision_generation_scheduler_config
  where id = true
$$;

revoke all on function public.get_generation_scheduler_secret() from public, anon, authenticated;
grant execute on function public.get_generation_scheduler_secret() to service_role;
