-- Retire the obsolete client-managed provider credential table.
-- BeatVision now uses the server-side Arena provider boundary. Client roles
-- no longer need access to image_provider_settings, especially api_key.
ALTER TABLE public.image_provider_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.image_provider_settings FROM anon, authenticated;

COMMENT ON TABLE public.image_provider_settings IS
  'Retired legacy provider configuration. Provider credentials must remain server-side.';
