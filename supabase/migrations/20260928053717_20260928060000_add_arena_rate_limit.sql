create table if not exists public.beatvision_arena_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, window_start)
);

alter table public.beatvision_arena_rate_limits enable row level security;

revoke all on table public.beatvision_arena_rate_limits from anon, authenticated;

create or replace function public.consume_beatvision_arena_rate_limit(
  p_limit integer default 30,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
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

  if p_limit < 1 or p_window_seconds not in (10, 60) then
    raise exception 'Invalid rate limit configuration';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.beatvision_arena_rate_limits (user_id, window_start, request_count)
  values (v_user_id, v_window_start, 1)
  on conflict (user_id, window_start)
  do update set request_count = public.beatvision_arena_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.beatvision_arena_rate_limits
  where user_id = v_user_id
    and window_start < v_window_start - make_interval(secs => p_window_seconds * 2);

  return v_count <= p_limit;
end;
$$;

revoke all on function public.consume_beatvision_arena_rate_limit(integer, integer) from public, anon;
grant execute on function public.consume_beatvision_arena_rate_limit(integer, integer) to authenticated;
