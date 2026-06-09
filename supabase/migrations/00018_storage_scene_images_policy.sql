
CREATE POLICY "scene_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'scene-images');
CREATE POLICY "scene_images_owner_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'scene-images' AND auth.role() = 'authenticated');
CREATE POLICY "scene_images_owner_update" ON storage.objects FOR UPDATE USING (bucket_id = 'scene-images' AND auth.role() = 'authenticated');
CREATE POLICY "scene_images_owner_delete" ON storage.objects FOR DELETE USING (bucket_id = 'scene-images' AND auth.role() = 'authenticated');
