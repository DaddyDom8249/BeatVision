set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare affected integer; b text; begin
 foreach b in array array['scene-images','render-manifests'] loop
  update storage.objects set payload='attacker' where bucket_id=b;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'CROSS_OWNER_UPDATE_ALLOWED: %',b; end if;
  delete from storage.objects where bucket_id=b;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'CROSS_OWNER_DELETE_ALLOWED: %',b; end if;
  begin
   insert into storage.objects values('spoof-'||b,b,'legacy/path','00000000-0000-0000-0000-000000000002','spoof');
   raise exception 'FOREIGN_OWNER_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
  insert into storage.objects values('own-'||b,b,'existing/project/path',auth.uid()::text,'original');
  update storage.objects set payload='own update' where id='own-'||b;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'OWNER_UPDATE_BROKEN'; end if;
  begin
   update storage.objects set owner_id='00000000-0000-0000-0000-000000000002' where id='own-'||b;
   raise exception 'OWNERSHIP_TRANSFER_ALLOWED';
  exception when insufficient_privilege then null; end;
  delete from storage.objects where id='own-'||b;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'OWNER_DELETE_BROKEN'; end if;
 end loop;
end $test$;
set role anon;
do $test$ begin
 if (select count(*) from storage.objects)<>2 then raise exception 'PUBLIC_READ_CHANGED'; end if;
 begin insert into storage.objects values('anon','scene-images','path',null,'bad'); raise exception 'ANON_INSERT_ALLOWED';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
do $test$ begin
 if (select count(*) from storage.objects)<>2 or exists(select 1 from storage.objects where payload<>'approved') then raise exception 'EXISTING_ASSET_CHANGED'; end if;
 if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'RLS_DISABLED'; end if;
end $test$;
select 'LEGACY_STORAGE_OWNERSHIP_PASS' result;
