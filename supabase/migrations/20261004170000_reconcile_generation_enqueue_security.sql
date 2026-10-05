-- Reconcile the production generation enqueue boundary.
--
-- The enqueue RPC validates project/scene/Vision Lock ownership itself.
-- It must be able to insert generation_jobs without granting table INSERT
-- privileges to authenticated clients. SECURITY DEFINER provides that narrow
-- capability while the function remains ownership-gated.
--
-- Keep pg_temp last in search_path so writable temporary objects cannot mask
-- referenced objects inside the SECURITY DEFINER function.

begin;

alter function public.enqueue_scene_generation(uuid, uuid, text)
  security definer
  set search_path = public, pg_temp;

revoke all
  on function public.enqueue_scene_generation(uuid, uuid, text)
  from public;

revoke all
  on function public.enqueue_scene_generation(uuid, uuid, text)
  from anon;

grant execute
  on function public.enqueue_scene_generation(uuid, uuid, text)
  to authenticated;

-- Preserve the table boundary. Clients must use the validated RPC rather than
-- receiving direct write access to generation_jobs.
revoke insert, update, delete
  on public.generation_jobs
  from anon, authenticated;

commit;
