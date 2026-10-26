drop function if exists public.consume_beatvision_arena_rate_limit(integer, integer);

drop policy if exists "arena_rate_limits_select_own" on public.beatvision_arena_rate_limits;
drop policy if exists "arena_rate_limits_insert_own" on public.beatvision_arena_rate_limits;
drop policy if exists "arena_rate_limits_update_own" on public.beatvision_arena_rate_limits;
drop policy if exists "arena_rate_limits_delete_own" on public.beatvision_arena_rate_limits;

create policy "arena_rate_limits_select_own"
  on public.beatvision_arena_rate_limits
  for select to authenticated
  using (user_id = auth.uid());

create policy "arena_rate_limits_insert_own"
  on public.beatvision_arena_rate_limits
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "arena_rate_limits_update_own"
  on public.beatvision_arena_rate_limits
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "arena_rate_limits_delete_own"
  on public.beatvision_arena_rate_limits
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.beatvision_arena_rate_limits to authenticated;

create or replace function public.consume_beatvision_arena_rate_limit()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_start timestamptz;
  v_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / 60) * 60
  );

  insert into public.beatvision_arena_rate_limits (user_id, window_start, request_count)
  values (v_user_id, v_window_start, 1)
  on conflict (user_id, window_start)
  do update set request_count = public.beatvision_arena_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.beatvision_arena_rate_limits
  where user_id = v_user_id
    and window_start < v_window_start - interval '2 minutes';

  return v_count <= 30;
end;
$$;

revoke all on function public.consume_beatvision_arena_rate_limit() from public, anon;
grant execute on function public.consume_beatvision_arena_rate_limit() to authenticated;
