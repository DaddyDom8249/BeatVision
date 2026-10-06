-- BeatVision 1: secure Vision Lock RPC boundary
-- The Vision Lock table is intentionally not client-insertable. The RPC
-- performs its own authenticated owner check and builds the immutable snapshot
-- server-side, so it must execute with controlled definer privileges.
begin;

alter function public.create_vision_lock(uuid)
  security definer
  set search_path = public;

revoke execute on function public.create_vision_lock(uuid) from public, anon;
grant execute on function public.create_vision_lock(uuid) to authenticated, service_role;

commit;
