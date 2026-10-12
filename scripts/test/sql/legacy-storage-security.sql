-- Verify exact ownership and immutable-client-write contract on disposable DB.
begin;
do $checks$
begin
  if (select count(*) from storage.objects) <> 5 then
    raise exception 'LEGACY_OBJECTS_CHANGED';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (policyname ilike 'BeatVision authenticated % non-song storage'
           or policyname ilike 'BeatVision authenticated % scene images')
      and cmd in ('INSERT','UPDATE','DELETE')
  ) then raise exception 'LEGACY_PERMISSIVE_WRITE_POLICY_SURVIVED'; end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'BeatVision owner-scoped legacy scene image insert'
      and cmd = 'INSERT'
  ) then raise exception 'OWNER_SCOPED_POLICY_MISSING'; end if;
end;
$checks$;
commit;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $checks$
declare changed integer;
begin
  -- Authenticated user may insert a new scene-image only under their own project.
  insert into storage.objects values
    ('scene-images','00000000-0000-0000-0000-000000000102/new.jpg');
  begin
    insert into storage.objects values
      ('scene-images','00000000-0000-0000-0000-000000000101/attacker.jpg');
    raise exception 'CROSS_OWNER_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects values ('scene-images','legacy-orphan/attacker.jpg');
    raise exception 'ORPHAN_PREFIX_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects values ('render-manifests','browser-renders/attacker.json');
    raise exception 'MANIFEST_CLIENT_INSERT_ALLOWED';
  exception when insufficient_privilege then null;
  end;
  update storage.objects set name = name || '.tampered'
    where bucket_id = 'scene-images'
      and name = '00000000-0000-0000-0000-000000000101/original.jpg';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'CROSS_OWNER_UPDATE_ALLOWED'; end if;
  update storage.objects set name = name || '.tampered'
    where bucket_id = 'scene-images'
      and name = '00000000-0000-0000-0000-000000000102/original.jpg';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'APPROVED_MEDIA_REWRITE_ALLOWED'; end if;
  delete from storage.objects where bucket_id = 'scene-images'
    and name = '00000000-0000-0000-0000-000000000101/original.jpg';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'CROSS_OWNER_DELETE_ALLOWED'; end if;
  delete from storage.objects where bucket_id = 'render-manifests'
    and name = 'browser-renders/legacy.json';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'MANIFEST_CLIENT_DELETE_ALLOWED'; end if;
end;
$checks$;
commit;

begin;
set local role anon;
do $checks$
begin
  begin
    insert into storage.objects values ('scene-images','00000000-0000-0000-0000-000000000101/anon.jpg');
    raise exception 'ANON_UPLOAD_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end;
$checks$;
rollback;

-- Service-role persistence must remain operational for server-side workflows.
begin;
set local role service_role;
insert into storage.objects values ('render-manifests','browser-renders/server.json');
rollback;
-- Existing public read policy must remain in place.
do $checks$
begin
  if not exists (select 1 from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='BeatVision public read scene images' and cmd='SELECT')
    then raise exception 'PUBLIC_READ_CHANGED'; end if;
end;
$checks$;
