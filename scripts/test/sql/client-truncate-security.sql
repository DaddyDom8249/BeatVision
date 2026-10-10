set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ begin
  if (select count(*) from public.final_videos)<>1 then raise exception 'OWNER_RLS_BROKEN'; end if;
  begin
    truncate public.final_videos;
    raise exception 'CLIENT_TRUNCATE_BYPASSED_OWNER_RLS_AND_APPROVAL';
  exception when insufficient_privilege then null; end;
  update public.final_videos set status='owner-edit' where id=1;
  if not found then raise exception 'OWNER_UPDATE_REVOKED'; end if;
end $test$;
set role anon;
do $test$ begin
  begin truncate public.final_videos;raise exception 'ANONYMOUS_TRUNCATE_ALLOWED';
  exception when insufficient_privilege then null;end;
end $test$;
reset role;
create table public.future_application_table(id integer);
do $test$ begin
  if (select count(*) from public.final_videos)<>2 or not exists(select from public.final_videos where id=2 and status='approved') then raise exception 'APPROVED_ROWS_LOST'; end if;
  if not (select relrowsecurity from pg_class where oid='public.final_videos'::regclass) then raise exception 'RLS_DISABLED'; end if;
  if has_table_privilege('authenticated','public.future_application_table','TRUNCATE') or has_table_privilege('anon','public.future_application_table','TRUNCATE') then raise exception 'FUTURE_TABLE_CLIENT_TRUNCATE_ALLOWED'; end if;
  if not has_table_privilege('service_role','public.final_videos','TRUNCATE') or not has_table_privilege('postgres','public.final_videos','TRUNCATE') then raise exception 'SERVER_ADMIN_PRIVILEGES_REMOVED'; end if;
  if not has_table_privilege('authenticated','public.final_videos','SELECT,INSERT,UPDATE,DELETE') then raise exception 'OWNER_CRUD_REVOKED'; end if;
end $test$;
select 'CLIENT_TRUNCATE_SECURITY_PASS' as result;
