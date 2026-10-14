# Hardening pass 2026-10-14 — migrations and manual steps

## Verified repair checkpoint — 2026-10-14

PR #103 includes the merged streaming request cap from PR #104 **on the repair branch only**.
The approved-media hardening now blocks direct deletion of *every generated take*
while its parent project exists, including takes intentionally demoted from
approved to generated. This preserves historical approved takes and stops
approve → deapprove → DELETE bypass. It also revokes TRUNCATE on both asset
tables from PUBLIC/anon/authenticated/service_role. Database owners still have
inherent PostgreSQL privileges; production service keys and SQL owner accounts
must remain secret.

The migration also repairs pre-existing cascade incompatibilities in confirmed
World, approved Phase 3, Vision Lock, approved Visual Plan and approved-scene
immutability functions. Their normal UPDATE and direct DELETE protection remains;
only DELETE actions performed after their parent project's removal are allowed.

**Verification at source SHA 29013c751c000f5c22dfb9726e2629e0cc2aa99a:**
GitHub Production CI 38621247888 SUCCESS (265 tests, 264 pass,
1 existing skip, 0 failures; production-audit and build successful).
Isolated real PostgreSQL migration replay 38621247460 SUCCESS, including
service_role grants, TRUNCATE denial, approval-demotion deletion denial,
immutability guards and project CASCADE. Legacy storage and enqueue security
workflows also SUCCESS. Earlier reproduction runs 38620324234 and
38620798868 failed at existing World and Phase 3 cascade triggers respectively;
the corrected migration passed after those targeted fixes.

**Not yet released:** No PR merged into main, migration applied to the live DB,
Edge Function redeployed or authenticated production end-to-end test.
The migration is broader than the original patch and requires final production
schema/grant compatibility review before any apply.

## Migration (additive, NOT applied; apply by hand)

`supabase/migrations/20261014180000_approved_asset_media_immutability.sql`

- Adds function `public.prevent_generated_asset_media_mutation()` and BEFORE UPDATE OR DELETE
  triggers `scene_image_assets_media_immutable` and `motion_clip_assets_media_immutable`.
- Effect: media/lineage columns (`project_id, visual_plan_id, scene_id, generation_job_id,
  scene_image_id, provider, model, image_url, video_url, storage_path`) cannot be changed after
  insert. **All generated takes** remain append-only while their project exists,
  regardless of current approval status. Direct deletion is rejected and app
  roles cannot TRUNCATE. `status` / `approved` transitions, including approved
  take swaps, are unaffected. The migration also updates existing immutability
  triggers to permit full parent-project cascade deletion.
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


## Production database release — 2026-10-14

The migration documented above **was applied** after the isolated PostgreSQL tests
and read-only live-function compatibility checks passed. Supabase project
`mdofsinyofqbeapzfygu` returned `success:true`. Migration ledger entry:
`20261014191504 / approved_asset_media_immutability_20261014`.

Read-only post-apply verification found both asset media triggers enabled, both
service-role TRUNCATE privileges revoked, service-role UPDATE/DELETE rights
preserved, and expected project-cascade exceptions installed on seven legacy
immutability functions. The migration contained no DML that rewrites/deletes
assets. **No live destructive/creator approval test** was performed; tests
that exercise row deletion and cascades ran against an isolated database only.
PR #103 remains unmerged to main and its Edge function source remains undeployed.
The earlier "NOT applied" instructions above are retained as historical
pre-release guidance and are superseded by this section.


## World and Style Draft Edge release — 2026-10-14

Pre-deployment retrieval established that World v40 and Style Draft v8 matched
GitHub `main` exactly; the proposed files differed only by the tested
hardening patch. Both deployed versions are now ACTIVE:

- `beatvision-world` v41, with existing `verify_jwt=false` custom-auth setting
  preserved
- `beatvision-style-draft` v9, with existing `verify_jwt=true` preserved

Both deployed source files were retrieved after deploy and matched the tested
PR #103 source byte-for-byte, including streaming-body byte guards and 413 error
handling. This supersedes the earlier "Edge source not deployed" note.
**No authenticated production Edge request or creator workflow was performed**;
active versions plus exact source do not establish end-to-end behavior.
