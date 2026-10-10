set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image');
  b:=public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image');
  if a.id<>b.id or a.status<>'queued' then raise exception 'OWNER_SCENE_ENQUEUE_OR_IDEMPOTENCY_FAILED'; end if;
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  b:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.id<>b.id or a.status<>'queued' then raise exception 'OWNER_ASSEMBLY_ENQUEUE_OR_IDEMPOTENCY_FAILED'; end if;
  if (select count(*) from public.generation_jobs)<>2 then raise exception 'DUPLICATE_JOBS'; end if;
  begin insert into public.generation_jobs(job_type) values('scene_image'); raise exception 'DIRECT_INSERT_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin update public.generation_jobs set status='completed'; raise exception 'DIRECT_UPDATE_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin perform public.enqueue_scene_generation('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000300','scene_image'); raise exception 'CROSS_PROJECT_SCENE_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin perform public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000200'); raise exception 'CROSS_PROJECT_ASSEMBLY_ALLOWED';
  exception when insufficient_privilege then null; end;
end $test$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $test$ begin
  if (select count(*) from public.generation_jobs)<>0 then raise exception 'OTHER_OWNER_CAN_READ_JOBS'; end if;
  begin perform public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image'); raise exception 'OTHER_OWNER_SCENE_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin perform public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200'); raise exception 'OTHER_OWNER_ASSEMBLY_ALLOWED';
  exception when insufficient_privilege then null; end;
end $test$;
set request.jwt.claim.sub='';
do $test$ begin
  begin perform public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image'); raise exception 'NO_USER_SCENE_ALLOWED';
  exception when insufficient_privilege then null; end;
end $test$;
set role anon;
do $test$ begin
  begin perform public.enqueue_scene_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000300','scene_image'); raise exception 'ANONYMOUS_RPC_ALLOWED';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;
do $test$ begin
  if not (select relrowsecurity from pg_class where oid='public.generation_jobs'::regclass) then raise exception 'RLS_DISABLED'; end if;
  if has_table_privilege('authenticated','public.generation_jobs','INSERT') or has_table_privilege('authenticated','public.generation_jobs','UPDATE') then raise exception 'CLIENT_JOB_WRITES_GRANTED'; end if;
  if (select count(*) from public.generation_jobs)<>2 then raise exception 'UNAUTHORIZED_MUTATIONS'; end if;
end $test$;
select 'GENERATION_ENQUEUE_SECURITY_PASS' as result;
