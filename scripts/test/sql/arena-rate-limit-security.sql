-- Executed only against the disposable migration-replay database.
-- Failure is fatal to CI. Do not execute this fixture against production.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $test$
declare n int; accepted boolean;
begin
  for n in 1..31 loop
    accepted := public.consume_beatvision_arena_rate_limit();
    if accepted is distinct from (n <= 30) then
      raise exception 'RATE_LIMIT_BYPASS_OR_RPC_BROKEN: attempt %, allowed %', n, accepted;
    end if;
  end loop;
  if (select request_count from public.beatvision_arena_rate_limits
      where user_id = auth.uid() limit 1) <> 31 then
    raise exception 'RATE_LIMIT_ATOMIC_INCREMENT_FAILED';
  end if;
  begin
    update public.beatvision_arena_rate_limits
      set request_count = 0 where user_id = auth.uid();
    raise exception 'CLIENT_COUNTER_RESET_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.beatvision_arena_rate_limits where user_id = auth.uid();
    raise exception 'CLIENT_COUNTER_DELETE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.beatvision_arena_rate_limits(user_id,window_start,request_count)
      values(auth.uid(),now(),-999);
    raise exception 'CLIENT_COUNTER_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$test$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $test$
begin
  if exists(select from public.beatvision_arena_rate_limits) then
    raise exception 'CROSS_ACCOUNT_RATE_COUNT_READ';
  end if;
  if not public.consume_beatvision_arena_rate_limit() then
    raise exception 'SECOND_USER_LIMIT_WRONG';
  end if;
end
$test$;
reset role;
set role anon;
do $test$
begin
  begin
    perform public.consume_beatvision_arena_rate_limit();
    raise exception 'ANON_RATE_LIMIT_RPC_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end
$test$;
reset role;
select 'ARENA_RATE_LIMIT_SECURITY_PASS' as result;
