
INSERT INTO storage.buckets (id, name, public) VALUES ('songs', 'songs', true);

CREATE POLICY "Users can upload songs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'songs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Songs are publicly readable" ON storage.objects
  FOR SELECT USING (bucket_id = 'songs');

CREATE POLICY "Users can delete own songs" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'songs' AND auth.uid()::text = (storage.foldername(name))[1]);
