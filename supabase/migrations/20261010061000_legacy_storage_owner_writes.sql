-- Tighten only writes in legacy public buckets; preserve public reads and all objects.
begin;
drop policy if exists "BeatVision authenticated upload non-song storage" on storage.objects;
drop policy if exists "BeatVision authenticated update non-song storage" on storage.objects;
drop policy if exists "BeatVision authenticated delete non-song storage" on storage.objects;
drop policy if exists "BeatVision authenticated upload scene images" on storage.objects;
drop policy if exists "BeatVision authenticated update scene images" on storage.objects;
drop policy if exists "BeatVision authenticated delete scene images" on storage.objects;
create policy "legacy_storage_owner_insert" on storage.objects for insert to authenticated  with check (bucket_id in ('scene-images','render-manifests') and owner_id = (select auth.uid())::text);
create policy "legacy_storage_owner_update" on storage.objects for update to authenticated using (bucket_id in ('scene-images','render-manifests') and owner_id = (select auth.uid())::text) with check (bucket_id in ('scene-images','render-manifests') and owner_id = (select auth.uid())::text);
create policy "legacy_storage_owner_delete" on storage.objects for delete to authenticated using (bucket_id in ('scene-images','render-manifests') and owner_id = (select auth.uid())::text) ;
commit;
