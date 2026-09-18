-- The storyboard replacement RPC only needs the caller's RLS context.
alter function public.beatvision_replace_storyboard(uuid,jsonb) security invoker;
revoke all on function public.beatvision_replace_storyboard(uuid,jsonb) from public;
revoke all on function public.beatvision_replace_storyboard(uuid,jsonb) from anon;
grant execute on function public.beatvision_replace_storyboard(uuid,jsonb) to authenticated;