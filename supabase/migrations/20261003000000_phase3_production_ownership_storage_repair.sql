-- BeatVision Phase 3 production ownership/storage repair
insert into storage.buckets (id, name, public)
values ('visual-assets', 'visual-assets', false)
on conflict (id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['style_bibles','characters','character_assets','environments','environment_assets'] loop
    execute format('drop policy if exists %I on public.%I', t||'_owner_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_owner_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_owner_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.projects p where p.id = %I.project_id and p.owner_id = auth.uid()))', t||'_owner_select', t, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.projects p where p.id = %I.project_id and p.owner_id = auth.uid()))', t||'_owner_insert', t, t);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.projects p where p.id = %I.project_id and p.owner_id = auth.uid())) with check (exists (select 1 from public.projects p where p.id = %I.project_id and p.owner_id = auth.uid()))', t||'_owner_update', t, t, t);
  end loop;
end $$;

drop policy if exists "visual_assets_owner_select" on storage.objects;
drop policy if exists "visual_assets_owner_insert" on storage.objects;
drop policy if exists "visual_assets_owner_update" on storage.objects;
drop policy if exists "visual_assets_owner_delete" on storage.objects;

create policy "visual_assets_owner_select" on storage.objects
for select to authenticated
using (bucket_id = 'visual-assets' and split_part(name, '/', 1) = auth.uid()::text);

create policy "visual_assets_owner_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'visual-assets' and split_part(name, '/', 1) = auth.uid()::text);

create policy "visual_assets_owner_update" on storage.objects
for update to authenticated
using (bucket_id = 'visual-assets' and split_part(name, '/', 1) = auth.uid()::text)
with check (bucket_id = 'visual-assets' and split_part(name, '/', 1) = auth.uid()::text);

create policy "visual_assets_owner_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'visual-assets' and split_part(name, '/', 1) = auth.uid()::text);
