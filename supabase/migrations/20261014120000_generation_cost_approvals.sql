-- REQUIRES MANUAL APPLY. Not applied to any live Supabase project by the PR
-- that added it; live verification is BLOCKED until the owner applies it.
--
-- Explicit, recorded user approval before every paid (or unknown-cost)
-- provider render. The browser shows the model and cost estimate and calls
-- approve_generation_cost(); the beatvision-generation edge function refuses
-- to call a provider unless it can atomically consume a matching, unexpired,
-- unconsumed approval for the job (service role). Rows are append-only: the
-- only permitted update is the one-time consume.

create table if not exists public.generation_cost_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  visual_plan_id uuid not null references public.visual_plans(id) on delete cascade,
  scene_id uuid references public.visual_plan_scenes(id) on delete cascade,
  job_type text not null check (job_type in ('scene_image', 'scene_motion', 'assembly')),
  model_id text not null check (model_id ~ '^[a-z0-9]+:[a-z0-9._-]+$'),
  pricing_version text not null check (length(pricing_version) between 1 and 64),
  estimate jsonb not null default '{}'::jsonb,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_by_job_id uuid unique references public.generation_jobs(id) on delete set null,
  consumed_at timestamptz,
  check ((job_type = 'assembly') = (scene_id is null))
);

create index if not exists generation_cost_approvals_lookup
  on public.generation_cost_approvals (project_id, visual_plan_id, job_type, scene_id, approved_at desc)
  where consumed_by_job_id is null;

alter table public.generation_cost_approvals enable row level security;

drop policy if exists generation_cost_approvals_owner_select on public.generation_cost_approvals;
create policy generation_cost_approvals_owner_select on public.generation_cost_approvals
  for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

revoke insert, update, delete on public.generation_cost_approvals from anon, authenticated;

create or replace function public.generation_cost_approvals_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'GENERATION_COST_APPROVAL_IMMUTABLE' using errcode = '55000';
  end if;
  if old.consumed_by_job_id is not null
     or new.consumed_by_job_id is null
     or (to_jsonb(new) - 'consumed_by_job_id' - 'consumed_at')
        is distinct from (to_jsonb(old) - 'consumed_by_job_id' - 'consumed_at') then
    raise exception 'GENERATION_COST_APPROVAL_IMMUTABLE' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists generation_cost_approvals_append_only on public.generation_cost_approvals;
create trigger generation_cost_approvals_append_only
  before update or delete on public.generation_cost_approvals
  for each row execute function public.generation_cost_approvals_append_only();

create or replace function public.approve_generation_cost(
  p_project_id uuid,
  p_visual_plan_id uuid,
  p_scene_id uuid,
  p_job_type text,
  p_model_id text,
  p_pricing_version text,
  p_estimate jsonb
)
returns public.generation_cost_approvals
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.generation_cost_approvals;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;
  if not exists (select 1 from public.projects p where p.id = p_project_id and p.owner_id = auth.uid()) then
    raise exception 'PROJECT_NOT_FOUND' using errcode = '42501';
  end if;
  if not exists (select 1 from public.visual_plans vp where vp.id = p_visual_plan_id and vp.project_id = p_project_id) then
    raise exception 'VISUAL_PLAN_NOT_FOUND' using errcode = '42501';
  end if;
  if p_job_type <> 'assembly' and not exists (
    select 1 from public.visual_plan_scenes s
     where s.id = p_scene_id and s.visual_plan_id = p_visual_plan_id and s.project_id = p_project_id
  ) then
    raise exception 'SCENE_NOT_FOUND' using errcode = '42501';
  end if;

  insert into public.generation_cost_approvals
    (project_id, visual_plan_id, scene_id, job_type, model_id, pricing_version, estimate, approved_by)
  values
    (p_project_id, p_visual_plan_id, case when p_job_type = 'assembly' then null else p_scene_id end,
     p_job_type, p_model_id, p_pricing_version, coalesce(p_estimate, '{}'::jsonb), auth.uid())
  returning * into created;
  return created;
end;
$$;

revoke all on function public.approve_generation_cost(uuid, uuid, uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.approve_generation_cost(uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
