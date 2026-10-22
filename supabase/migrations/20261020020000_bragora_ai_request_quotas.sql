-- Fail-closed, owner-authorized, atomic daily inference budgets.
-- No provider account is enabled by this migration; Edge feature flags stay off.
begin;
create table if not exists public.bragora_ai_usage_daily (
 actor_id uuid not null, operation text not null,
 usage_day date not null default (now() at time zone 'UTC')::date,
 request_count int not null default 0 check(request_count >= 0),
 primary key(actor_id, operation, usage_day),
 constraint bragora_ai_usage_operation check(operation in ('director', 'interpretation'))
);
create table if not exists public.bragora_ai_inflight (
 project_id uuid not null, operation text not null,
 ticket uuid not null default gen_random_uuid(),
 expires_at timestamptz not null,
 primary key(project_id, operation),
 constraint bragora_ai_inflight_operation check(operation in ('director', 'interpretation'))
);
alter table public.bragora_ai_usage_daily enable row level security;
alter table public.bragora_ai_inflight enable row level security;
revoke all on public.bragora_ai_usage_daily, public.bragora_ai_inflight from public, anon, authenticated;
grant all on public.bragora_ai_usage_daily, public.bragora_ai_inflight to service_role;
create or replace function public.reserve_bragora_ai_request(
 p_project_id uuid,p_actor_id uuid,p_operation text,p_limit integer
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ticket uuid; v_used integer;
begin
 if p_operation not in ('director','interpretation') or p_limit is null or p_limit < 1 or p_limit > 20 then
  raise exception 'AI_QUOTA_CONFIGURATION_INVALID' using errcode='23514';
 end if;
 if p_actor_id is null or not exists(select 1 from public.projects where id=p_project_id and owner_id=p_actor_id) then
  raise exception 'AI_PROJECT_FORBIDDEN' using errcode='42501';
 end if;
 insert into public.bragora_ai_usage_daily(actor_id,operation,usage_day,request_count)
 values(p_actor_id,p_operation,(now() at time zone 'UTC')::date,1)
 on conflict(actor_id,operation,usage_day)
 do update set request_count=bragora_ai_usage_daily.request_count + 1
 where bragora_ai_usage_daily.request_count < p_limit
 returning request_count into v_used;
 if v_used is null then
  raise exception 'AI_DAILY_QUOTA_EXHAUSTED' using errcode='23514';
 end if;
 insert into public.bragora_ai_inflight(project_id,operation,expires_at)
 values(p_project_id,p_operation,now()+interval '25 seconds')
 on conflict(project_id,operation)
 do update set ticket=gen_random_uuid(),expires_at=excluded.expires_at
 where bragora_ai_inflight.expires_at < now()
 returning ticket into v_ticket;
 if v_ticket is null then
  -- Keep the rate-limit reservation; no external call is made.
  raise exception 'AI_REQUEST_ALREADY_RUNNING' using errcode='23514';
 end if;
 return v_ticket;
end; $$;
create or replace function public.release_bragora_ai_request(
 p_project_id uuid,p_actor_id uuid,p_operation text,p_ticket uuid
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.projects where id=p_project_id and owner_id=p_actor_id) then
  raise exception 'AI_PROJECT_FORBIDDEN' using errcode='42501';
 end if;
 delete from public.bragora_ai_inflight where project_id=p_project_id and operation=p_operation and ticket=p_ticket;
 return found;
end; $$;
revoke all on function public.reserve_bragora_ai_request(uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.release_bragora_ai_request(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_bragora_ai_request(uuid,uuid,text,integer) to service_role;
grant execute on function public.release_bragora_ai_request(uuid,uuid,text,uuid) to service_role;
commit;
