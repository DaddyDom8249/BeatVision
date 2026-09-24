-- Harden public RLS policies by caching auth.uid() once per statement.
do $$
declare
  r record;
  new_qual text;
  new_check text;
  stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ilike '%auth.uid()%'
        or coalesce(with_check, '') ilike '%auth.uid()%'
      )
  loop
    new_qual := case
      when r.qual is null then null
      else regexp_replace(r.qual, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g')
    end;
    new_check := case
      when r.with_check is null then null
      else regexp_replace(r.with_check, 'auth\\.uid\\(\\)', '(select auth.uid())', 'g')
    end;

    stmt := format(
      'alter policy %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );

    if new_qual is not null then
      stmt := stmt || format(' using (%s)', new_qual);
    end if;

    if new_check is not null then
      stmt := stmt || format(' with check (%s)', new_check);
    end if;

    execute stmt;
  end loop;
end
$$;
