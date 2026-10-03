-- Make Visual Plan approval atomic: child scenes and parent plan lock together.

create or replace function public.approve_visual_plan(p_plan_id uuid)
returns public.visual_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_plan public.visual_plans;
  updated_plan public.visual_plans;
begin
  select vp.*
    into target_plan
    from public.visual_plans vp
   where vp.id = p_plan_id
     and exists (
       select 1
         from public.projects p
        where p.id = vp.project_id
          and p.owner_id = (select auth.uid())
     )
   for update;

  if target_plan.id is null then
    raise exception 'VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN'
      using errcode = '42501';
  end if;

  if target_plan.status <> 'draft' then
    raise exception 'VISUAL_PLAN_ALREADY_LOCKED'
      using errcode = '55000',
            detail = 'The Visual Plan is already immutable.';
  end if;

  if not exists (
    select 1
      from public.visual_plan_scenes s
     where s.visual_plan_id = target_plan.id
  ) then
    raise exception 'VISUAL_PLAN_NO_SCENES'
      using errcode = '23514',
            detail = 'A Visual Plan must contain at least one scene before approval.';
  end if;

  update public.visual_plan_scenes
     set status = 'approved'
   where visual_plan_id = target_plan.id
     and status = 'draft';

  update public.visual_plans
     set status = 'approved',
         locked_at = now()
   where id = target_plan.id
     and status = 'draft'
   returning * into updated_plan;

  if updated_plan.id is null then
    raise exception 'VISUAL_PLAN_LOCK_CONFLICT'
      using errcode = '40001',
            detail = 'The Visual Plan changed while it was being locked. Reload and try again.';
  end if;

  return updated_plan;
end;
$$;

revoke all on function public.approve_visual_plan(uuid) from public;
grant execute on function public.approve_visual_plan(uuid) to authenticated;
