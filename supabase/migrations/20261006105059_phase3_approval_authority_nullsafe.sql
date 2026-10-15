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
    if new.approved_at is distinct from old.approved_at then
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
