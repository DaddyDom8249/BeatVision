-- Preserve the public Arena RPC but make its counters server-authoritative.
-- Existing rows, quota, RPC signature and authenticated caller contract are unchanged.
-- The public client cannot INSERT / UPDATE / DELETE its own rate-limit counters.
create table if not exists public.beatvision_arena_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, window_start)
);

alter table public.beatvision_arena_rate_limits enable row level security;

do $pol$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'beatvision_arena_rate_limits'
      and policyname = 'arena_rate_limits_select_own'
  ) then
    create policy arena_rate_limits_select_own
      on public.beatvision_arena_rate_limits
      for select to authenticated using (user_id = (select auth.uid()));
  end if;
end
$pol$;

-- The trusted Edge gateway already calls this exact RPC with the user's JWT.
-- SECURITY DEFINER is restricted to one fixed table, a bound JWT user ID,
-- schema-qualified references, and an empty search_path.
create or replace function public.consume_beatvision_arena_rate_limit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

revoke all on function public.consume_beatvision_arena_rate_limit() from public, anon;
grant execute on function public.consume_beatvision_arena_rate_limit() to authenticated, service_role;

-- Preserve owner-scoped reads. Privileged backends may still operate the table.
grant select on public.beatvision_arena_rate_limits to authenticated;
grant select, insert, update, delete on public.beatvision_arena_rate_limits to service_role;

-- Policies alone were insufficient: browsers had their own rate-counter DML.
revoke insert, update, delete on public.beatvision_arena_rate_limits from public, anon, authenticated;
drop policy if exists arena_rate_limits_insert_own on public.beatvision_arena_rate_limits;
drop policy if exists arena_rate_limits_update_own on public.beatvision_arena_rate_limits;
drop policy if exists arena_rate_limits_delete_own on public.beatvision_arena_rate_limits;
