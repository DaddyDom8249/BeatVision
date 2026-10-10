do $begin
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end$;
create schema if not exists auth; create schema if not exists storage;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table if not exists storage.buckets(id text primary key,name text,public boolean);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,owner uuid,metadata jsonb);
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
grant usage on schema public,auth,storage to authenticated,anon,service_role;
