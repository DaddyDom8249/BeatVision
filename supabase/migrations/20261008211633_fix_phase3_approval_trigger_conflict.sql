-- Phase 3 approval contract: the BEFORE UPDATE trigger owns approved_at.
-- Earlier RPCs attempted to set approved_at themselves, which the
-- enforce_phase3_approval_transition trigger rejects with
-- APPROVED_AT_DATABASE_AUTHORITY on every draft -> approved transition.
-- Preserve existing project-owner authorization and function invoker privileges.
create or replace function public.approve_environment(p_environment_id uuid)
returns public.environments
language plpgsql
set search_path = public
as $function$
declare
  result_row public.environments;
begin
  update public.environments e
     set status = 'approved'
   where e.id = p_environment_id
     and e.status = 'draft'
     and exists (
       select 1 from public.projects p
       where p.id = e.project_id
         and p.owner_id = (select auth.uid())
     )
  returning e.* into result_row;
  if result_row.id is null then
    raise exception 'ENVIRONMENT_NOT_FOUND_OR_ALREADY_APPROVED'
      using errcode = '42501';
  end if;
  return result_row;
end;
$function$;

create or replace function public.approve_character(p_character_id uuid)
returns public.characters
language plpgsql
set search_path = public
as $function$
declare
  result_row public.characters;
begin
  update public.characters c
     set status = 'approved'
   where c.id = p_character_id
     and c.status = 'draft'
     and exists (
       select 1 from public.projects p
       where p.id = c.project_id
         and p.owner_id = (select auth.uid())
     )
  returning c.* into result_row;
  if result_row.id is null then
    raise exception 'CHARACTER_NOT_FOUND_OR_ALREADY_APPROVED'
      using errcode = '42501';
  end if;
  return result_row;
end;
$function$;
