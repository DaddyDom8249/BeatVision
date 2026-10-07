-- Phase 3 hardening: approval workflow and immutable approved records.

create or replace function public.prevent_approved_phase3_record_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'PHASE3_APPROVED_IMMUTABLE'
      using errcode = '55000',
            detail = 'Approved Phase 3 records are immutable.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists style_bibles_approved_immutable on public.style_bibles;
create trigger style_bibles_approved_immutable
before update or delete on public.style_bibles
for each row execute function public.prevent_approved_phase3_record_mutation();

drop trigger if exists characters_approved_immutable on public.characters;
create trigger characters_approved_immutable
before update or delete on public.characters
for each row execute function public.prevent_approved_phase3_record_mutation();

drop trigger if exists environments_approved_immutable on public.environments;
create trigger environments_approved_immutable
before update or delete on public.environments
for each row execute function public.prevent_approved_phase3_record_mutation();

drop trigger if exists character_assets_approved_immutable on public.character_assets;
create trigger character_assets_approved_immutable
before update or delete on public.character_assets
for each row execute function public.prevent_approved_phase3_record_mutation();

drop trigger if exists environment_assets_approved_immutable on public.environment_assets;
create trigger environment_assets_approved_immutable
before update or delete on public.environment_assets
for each row execute function public.prevent_approved_phase3_record_mutation();

create or replace function public.approve_character(p_character_id uuid)
returns public.characters
language plpgsql
set search_path = public
as $$
declare
  result_row public.characters;
begin
  update public.characters c
     set status = 'approved',
         approved_at = coalesce(c.approved_at, now())
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
$$;

create or replace function public.approve_environment(p_environment_id uuid)
returns public.environments
language plpgsql
set search_path = public
as $$
declare
  result_row public.environments;
begin
  update public.environments e
     set status = 'approved',
         approved_at = coalesce(e.approved_at, now())
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
$$;

revoke all on function public.approve_character(uuid) from public;
grant execute on function public.approve_character(uuid) to authenticated;

revoke all on function public.approve_environment(uuid) from public;
grant execute on function public.approve_environment(uuid) to authenticated;
