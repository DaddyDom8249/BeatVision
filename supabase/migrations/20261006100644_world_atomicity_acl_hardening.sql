revoke all on function public.confirm_world_atomic(uuid) from public, anon, service_role;
revoke all on function public.create_world_revision_atomic(uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.confirm_world_atomic(uuid) to authenticated;
grant execute on function public.create_world_revision_atomic(uuid, jsonb, jsonb) to authenticated;
