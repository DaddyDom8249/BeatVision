-- Existing 00018 policies allowed any authenticated user to write to any
-- scene-images path. Replace those write policies with project-owner checks.

drop policy if exists "scene_images_owner_insert" on storage.objects;
drop policy if exists "scene_images_owner_update" on storage.objects;
drop policy if exists "scene_images_owner_delete" on storage.objects;

create policy "scene_images_owner_insert"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'scene-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = auth.uid()
  )
);

create policy "scene_images_owner_update"
on storage.objects
for update to authenticated
using (
  bucket_id = 'scene-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'scene-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = auth.uid()
  )
);

create policy "scene_images_owner_delete"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'scene-images'
  and exists (
    select 1
    from public.projects p
    where p.id::text = (storage.foldername(name))[1]
      and p.owner_id = auth.uid()
  )
);
