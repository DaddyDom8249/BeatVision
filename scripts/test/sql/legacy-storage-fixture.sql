-- Disposable PostgreSQL 16 fixture; never run on production.
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth,storage,public to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon;

create table public.projects (id uuid primary key, owner_id uuid not null);
alter table public.projects enable row level security;
create policy projects_owner_select on public.projects for select to authenticated
  using (owner_id = auth.uid());
grant select on public.projects to authenticated;

create table storage.objects (
  bucket_id text not null,
  name text not null,
  primary key (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated,anon,service_role;

insert into public.projects values
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000002');
insert into storage.objects values
  ('scene-images','00000000-0000-0000-0000-000000000101/original.jpg'),
  ('scene-images','00000000-0000-0000-0000-000000000102/original.jpg'),
  ('scene-images','legacy-orphan/original.jpg'),
  ('render-manifests','browser-renders/legacy.json'),
  ('visual-assets','00000000-0000-0000-0000-000000000001/private.jpg');

-- Reproduce the production's permissive legacy policies and unrelated reads.
create policy "BeatVision public read scene images" on storage.objects
  for select to public using (bucket_id = 'scene-images');
create policy "BeatVision authenticated read non-song storage" on storage.objects
  for select to authenticated
  using (bucket_id = any(array['scene-images','render-manifests']));
create policy "visual_assets_owner_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'visual-assets' and split_part(name,'/',1) = auth.uid()::text);
create policy "BeatVision authenticated upload non-song storage" on storage.objects
  for insert to authenticated
  with check (bucket_id = any(array['scene-images','render-manifests']));
create policy "BeatVision authenticated update non-song storage" on storage.objects
  for update to authenticated
  using (bucket_id = any(array['scene-images','render-manifests']))
  with check (bucket_id = any(array['scene-images','render-manifests']));
create policy "BeatVision authenticated delete non-song storage" on storage.objects
  for delete to authenticated
  using (bucket_id = any(array['scene-images','render-manifests']));
create policy "BeatVision authenticated upload scene images" on storage.objects
  for insert to authenticated with check (bucket_id = 'scene-images');
create policy "BeatVision authenticated update scene images" on storage.objects
  for update to authenticated using (bucket_id = 'scene-images')
  with check (bucket_id = 'scene-images');
create policy "BeatVision authenticated delete scene images" on storage.objects
  for delete to authenticated using (bucket_id = 'scene-images');
