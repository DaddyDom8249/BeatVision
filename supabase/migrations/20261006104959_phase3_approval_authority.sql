-- P0-C: authoritative approval and immutability boundaries for Style Bible,
-- Characters, Environments, and their reference assets.
begin;

create or replace function public.require_current_confirmed_world_reference()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project public.projects;
begin
  select p.* into v_project
  from public.projects p
  where p.id = new.project_id;

  if not found
     or v_project.world_report_id is distinct from new.world_report_id
     or v_project.world_confirmed_at is null
     or not exists (
       select 1
       from public.world_reports wr
       where wr.id = new.world_report_id
         and wr.project_id = new.project_id
         and wr.status = 'completed'
         and wr.confirmed_at is not null
     ) then
    raise exception 'WORLD_REFERENCE_NOT_CURRENT'
      using errcode = '23514',
            detail = 'Phase 3 records must reference the project current confirmed World revision.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_phase3_approval_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status = 'approved' then
    raise exception 'APPROVED_RECORD_IMMUTABLE'
      using errcode = '55000',
            detail = tg_table_name || ' approval is immutable; create an explicit replacement instead.';
  end if;

  if new.status not in ('draft','approved') then
    raise exception 'INVALID_APPROVAL_STATUS'
      using errcode = '23514';
  end if;

  if old.status = 'draft' and new.status = 'approved' then
    if new.approved_at is not null and new.approved_at <> old.approved_at then
      raise exception 'APPROVED_AT_DATABASE_AUTHORITY'
        using errcode = '23514',
              detail = 'approved_at is assigned by the database at approval time.';
    end if;
    new.approved_at := now();
  elsif old.status = 'draft' and new.status = 'draft' then
    if new.approved_at is distinct from old.approved_at then
      raise exception 'APPROVED_AT_INVALID'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_approved_phase3_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'APPROVED_RECORD_IMMUTABLE'
      using errcode = '55000',
            detail = tg_table_name || ' approval is immutable and cannot be deleted.';
  end if;
  return old;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['style_bibles','characters','character_assets','environments','environment_assets'] loop
    execute format('drop trigger if exists %I on public.%I', t||'_current_world_guard', t);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.require_current_confirmed_world_reference()',
      t||'_current_world_guard', t
    );

    execute format('drop trigger if exists %I on public.%I', t||'_approval_transition_guard', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.enforce_phase3_approval_transition()',
      t||'_approval_transition_guard', t
    );

    execute format('drop trigger if exists %I on public.%I', t||'_approved_delete_guard', t);
    execute format(
      'create trigger %I before delete on public.%I for each row execute function public.prevent_approved_phase3_delete()',
      t||'_approved_delete_guard', t
    );
  end loop;
end $$;

-- Approved reference assets are already delete-protected by the existing
-- prevent_approved_asset_delete trigger. Keep it as an explicit second line
-- of defense for assets, while the generic guard covers all Phase 3 rows.

-- Approved records cannot be mutated by ordinary authenticated table writes.
-- RLS continues to enforce project ownership; these triggers enforce lifecycle
-- state independently of the caller and therefore also protect service-side
-- writes and future clients.
comment on function public.enforce_phase3_approval_transition() is
'P0-C lifecycle authority: draft -> approved is one-way and approved_at is database-assigned.';
comment on function public.require_current_confirmed_world_reference() is
'P0-C lineage authority: Phase 3 records must bind to the project current confirmed World revision.';

commit;
