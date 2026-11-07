-- Additive scheduling metadata only. No provider requests or creative-state writes.
alter table public.generation_jobs
  add column if not exists next_poll_at timestamptz not null default now(),
  add column if not exists poll_lease_token uuid,
  add column if not exists poll_lease_until timestamptz;

create index if not exists generation_jobs_poll_due_idx
  on public.generation_jobs(next_poll_at, created_at, id)
  where status in ('submitted', 'processing');

create or replace function public.claim_generation_poll(p_job_id uuid default null, p_limit integer default 8)
returns setof public.generation_jobs
language plpgsql security definer set search_path = public
as $$
declare
  stamp timestamptz := clock_timestamp();
begin
  return query
  with due as (
    select j.id from public.generation_jobs j
    where j.status in ('submitted', 'processing')
      and (p_job_id is null or j.id = p_job_id)
      and j.next_poll_at <= stamp
      and (j.poll_lease_until is null or j.poll_lease_until <= stamp)
    order by j.next_poll_at, j.created_at, j.id
    limit greatest(1, least(coalesce(p_limit, 8), 8))
    for update skip locked
  )
  update public.generation_jobs j set
    poll_lease_token = gen_random_uuid(),
    poll_lease_until = stamp + interval '2 minutes',
    next_poll_at = stamp + interval '30 seconds'
  from due where j.id = due.id returning j.*;
end;
$$;

revoke all on function public.claim_generation_poll(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_generation_poll(uuid, integer) to service_role;
