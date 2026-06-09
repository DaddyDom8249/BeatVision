
CREATE POLICY "render_manifests_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'render-manifests');
CREATE POLICY "render_manifests_owner_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'render-manifests' AND auth.role() = 'authenticated');
CREATE POLICY "render_manifests_owner_update" ON storage.objects FOR UPDATE USING (bucket_id = 'render-manifests' AND auth.role() = 'authenticated');
