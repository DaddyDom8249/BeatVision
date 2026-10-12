-- Lock down legacy public buckets without touching stored objects or the
-- canonical private visual-assets bucket.
-- Production inventory 2026-10-10: no first-party browser writes to either
-- legacy bucket on main; current asset generation uses service-owned visual-assets.
-- Preserve legacy scene-image INSERT only for a creator's own project path.
-- All client-side UPDATE/DELETE remain disallowed to preserve approved media.
begin;

drop policy if exists "BeatVision authenticated upload non-song storage" on storage.objects;
drop policy if exists "BeatVision authenticated update non-song storage" on storage.objects;
drop policy if exists "BeatVision authenticated delete non-song storage" on storage.objects;
drop policy if exists "BeatVision authenticated upload scene images" on storage.objects;
drop policy if exists "BeatVision authenticated update scene images" on storage.objects;
drop policy if exists "BeatVision authenticated delete scene images" on storage.objects;

drop policy if exists "BeatVision owner-scoped legacy scene image insert" on storage.objects;
create policy "BeatVision owner-scoped legacy scene image insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'scene-images'
    and exists (
      select 1 from public.projects p
      where p.id::text = split_part(name, '/', 1)
        and p.owner_id = (select auth.uid())
    )
  );
-- Authenticated users cannot update/delete existing legacy images or write
-- render-manifests. Service-role storage writers remain unaffected.
-- Existing SELECT policies and all canonical visual-assets policies are untouched.

commit;
