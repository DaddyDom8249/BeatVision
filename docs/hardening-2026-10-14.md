# Hardening pass 2026-10-14 — migrations and manual steps

## Migration (additive, NOT applied; apply by hand)

`supabase/migrations/20261014180000_approved_asset_media_immutability.sql`

- Adds function `public.prevent_generated_asset_media_mutation()` and BEFORE UPDATE OR DELETE
  triggers `scene_image_assets_media_immutable` and `motion_clip_assets_media_immutable`.
- Effect: media/lineage columns (`project_id, visual_plan_id, scene_id, generation_job_id,
  scene_image_id, provider, model, image_url, video_url, storage_path`) can never be changed after
  insert, by any role including service_role. Approved rows cannot be deleted while their project
  exists (project cascade delete still works). `status` / `approved` transitions (approve, reject,
  PR #95 intentional take swap) are unaffected.
- No data is changed. No existing code path updates those columns (checked with `rg` over
  `supabase/functions` and `supabase/migrations` on origin/main).

Apply (owner, SQL editor or `psql`), then verify:

```sql
-- apply the file contents, then:
select tgname from pg_trigger where tgname like '%media_immutable';
-- expect 2 rows. Rollback if needed:
-- drop trigger scene_image_assets_media_immutable on public.scene_image_assets;
-- drop trigger motion_clip_assets_media_immutable on public.motion_clip_assets;
-- drop function public.prevent_generated_asset_media_mutation();
```

## Edge functions (redeploy by hand)

`beatvision-style-draft` (64 KB body cap) and `beatvision-world` (256 KB body cap) now return
413 `REQUEST_TOO_LARGE` for oversized bodies and no longer return raw database/runtime/provider
error text to the browser (details are logged server-side). Not deployed by this PR.

## Vercel

`vercel.json` adds `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'`,
`Referrer-Policy`, `Permissions-Policy`. A full script/connect-src CSP was intentionally not added
(Supabase, PostHog and provider media hosts would need an audited allowlist).
