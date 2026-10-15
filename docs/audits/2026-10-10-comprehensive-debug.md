# BeatVision systematic debug — 2026-10-10

## Current baseline and scope

Main HEAD remains `7dbea8b8009c68ba2e806a467790cc7d5d75141a`. Repairs are review branches, not merged main. Latest tested production frontend is `3176966681c13a346a0dfab5c2192375cd39a84c`, Vercel `dpl_B3N9ZqR24exA4hU1fFSr7L4qUA1g`, correct project `prj_uY6UsWukCvImpUbyaaHG7EGFF2Cq`, primary alias beat-vision-theta.vercel.app. Generation v24 and analyze-song v13 remain active. Read AGENTS.md, PROJECT_LOG.md, prior production audit, current workflow/screens/hooks, live job/asset/storage policies, migration ledger, advisors, and isolated PostgreSQL tests. No paid generation, new creator approval, data deletion, duplicate project, merge, or production ledger rewrite.

This is a systematic audit with verified repairs and explicit remaining gaps, not a certification that every application path works.

## Priorities

| Priority | Finding | Evidence/status | Action |
| --- | --- | --- | --- |
| P0 | Any authenticated user could overwrite/delete another owner's legacy storage files | Reproduced in PostgreSQL; FIXED/DEPLOYED | Owner-bound write policies, PR54 |
| P1 | Completed video had no application download control | Actual-page failure reproduced; FIXED/DEPLOYED | Blob download with error handling, PR55 |
| P1 | Empty database cannot replay repository migrations | FAILED: generation_jobs type missing at assembly migration | Restore authoritative missing application baseline, then require clean full replay; PR56 diagnostic |
| P1 | Full authenticated workflow and download remain unverified in this session | VERIFICATION-BLOCKED: old authenticated browser expired/unavailable; fresh browser unsigned | Restore an authorized session, verify existing Ghast; no duplicate projects or auth bypass |
| P1 | Genuine AI subject animation | BLOCKED: all approved Ghast clips are Shotstack image-motion; Pixazo account free allowance unknown | Verify an existing zero-cost generative video allocation before any request |
| P2 | Newer retry could hide actual procedural motion provenance | Reproduced reviewed PR53 regression; FIXED/DEPLOYED | Associate asset with its own job, guarded by project/scene/type |
| P2 | Failed project reads appeared to be an empty account | Reproduced 3 actual-page regressions; FIXED/DEPLOYED | Visible error and safe retry, PR57 |
| P2 | Repository main and production repair branch diverge | CONFIRMED; all repairs reviewable but unmerged | Review/integrate commits before another main-based deployment; no automatic merge |
| P2 | Assembly snapshot hardcodes GENERATIVE_VIDEO for procedural clips | CONFIRMED in live enqueue function and existing frozen manifest | Future enqueue provenance correction; preserve existing frozen snapshots |
| P3 | Leaked-password protection disabled | Supabase advisory WARN | Confirm zero-cost plan eligibility before enabling; no account upgrade |

## Repairs and exact verification

### Legacy storage ownership

Live `scene-images` and `render-manifests` buckets are public; existing public reads were preserved. Six permissive mutation policies checked bucket only. All 100 existing legacy objects have recorded owner_id. Replacement INSERT/UPDATE/DELETE policies require owner_id = auth.uid()::text; UPDATE checks both old/new rows, preventing ownership transfer. Private visual-assets and songs policies unchanged.

- Migration: `20261010061000_legacy_storage_owner_writes.sql`; applied live as `legacy_storage_owner_writes`.
- Red commit `2fff2590113bc2d4ba3ea3e0fcabcfd4700fc2ad`: Actions38050304327/job114207922517 raised CROSS_OWNER_UPDATE_ALLOWED.
- Fix `8f23cad74a793121222bc2ca04a670f82056aba8`: Actions38050321254/job114207974001 LEGACY_STORAGE_OWNERSHIP_PASS. Owner insert/update/delete preserved; foreign update/delete/insert and ownership transfer denied; anon writes denied; public reads/data preserved.
- ProductionCI38050321281/job114207971875:133 tests, audit/build passed. Enqueue security also passed.
- Live policies exactly owner-bound; all100 objects remain; Ghast8 approved images/8 approved motions unchanged.
- No destructive cross-account production test was performed.

### Download

The database-authoritative completed job already contains a real playable output. Page had no download control. New control fetches that exact media, validates HTTP status/non-empty video content, creates a Blob URL and triggers an MP4 download, releasing the object URL. No render request, provider switch, approved asset replacement, or database state fabrication. Completion remains required; errors do not remove the existing video.

- Test-first0ef45a105eb4cd5d5b7401df3155148e6298d7a3, CI38050519002/job114208532228:4 new download tests failed; pending-download exclusion already passed.
- First green60aeead30c505762ae869ad0703a5bf870221f36, CI38050541337/job114208597404:138/138,audit/build pass.
- Combined reviewed provenance365d0a125fef15fd5c76b196fc3a519996636db0, CI38050622962/job114208838413:139/139,audit/build and both PostgreSQL security suites pass.
- Actual anonymous browser from production origin fetched the existing MP4:HTTP200,video/mp4,34381862bytes. Prior browser playback verified1280x720,249.12seconds,audio/video decoding and seek near245seconds.
- The legacy downloadable flag remains unchanged (historically hardcoded false); the new control operates on the completed job's already accessible media. Authenticated button click and OS-saved-file verification remain UNVERIFIED; tests exercise actual source with a media stub. Sandbox watermark unchanged.

### Motion provenance

Reviewed scoped PR53 actual GitHub files, not Jules' unresolvable reported SHA. Imported only tested source/test changes while preserving assembly UI, download and backend fixes. Fetch historical asset job by project, scene, job_type and generation_job_id; keep newest retry separate; clear associated state on scene switch; recognize sync/polling procedural evidence. No historical approved asset rows rewritten. PR53 recorded red133/134, green134/134; combined suites139/139 then142/142. Same existing Jules task only; no new task created.

### Dashboard recovery

Dashboard ignored getUser/database errors and converted null data to an empty project list. Now surfaces the actual error, does not query projects on auth validation failure, supports retry, and always exits loading state. Existing owner filter retained.

- Red `481bbb84587e8e9e982ab4658fe50fe12915dbd8`, CI38050775651/job114209282732:139pass3fail.
- Fix `3176966681c13a346a0dfab5c2192375cd39a84c`, CI38050791449/job114209329386:142/142,audit/build pass; storage and enqueue security passed.
- Vercel READY exact tested SHA, explicit primary alias assignment. Production entry JS HTTP200 includes download, dashboard retry and procedural-provenance code.
- Anonymous homepage/bundle verified; authenticated project-list retry unverified.

## Migration replay: actual failure, not a passed reset

PR56 isolates PostgreSQL16 with platform-only auth/storage tables, no application fixtures. Repo migrations replay in sorted order. Actions38050731498/job114209150761 fails at `20261006174104_enqueue_assembly_generation.sql:191`: `type public.generation_jobs does not exist`. Previous Phase1 through reconciliation SQL executed. The diagnostic workflow uses continue-on-error to preserve evidence and its overall workflow conclusion is success; the replay step outcome and logs explicitly say FAILURE. This is not evidence of a successful schema reset.

Production has vision_locks, generation_jobs, scene_image_assets, motion_clip_assets and final_videos, and many historical ledger entries absent from repo. Do not reset production, delete data, copy arbitrary historical migrations blindly, or mark ledger versions applied to conceal drift. Missing baseline must be reconstructed from authorized schema definitions with security/trigger/grant verification and a real successful clean replay before considering recovery safe. No baseline reconstruction or deployment is claimed.

## Production evidence and remaining boundaries

Ghast retains8 approved images,8 approved motion clips,1 completed assembly and exactly1 final_video. No active queued/submitted/processing jobs across project inventory. Historical failed attempts remain as history; they are not automatically classified as current outages.

Frozen master timeline:8scenes,start0,end249.126875seconds. Original song249.126908314seconds; final media249.12seconds (container/frame rounding). This verifies near-equal duration and playback, not whole-song manual synchronization/continuity review.

Authentication and creative gates: RLS enabled on all public application tables. Supabase flags5 intentionally exposed SECURITY DEFINER RPCs; inspected definitions contain auth identity/owner checks. Do not revert enqueue to SECURITY INVOKER and reintroduce permission-denied job insertion. Full cross-account coverage of every legacy endpoint remains unverified. Security advisory reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
Password advisory: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Provider eligibility: no new provider requests. WorkersFree confirmation supports existing Cloudflare image path only. Existing Pixazo/AI-video eligibility remains UNKNOWN; Shotstack output is procedural and sandbox-watermarked. Its availability does not prove genuine AI subject animation.

Next: reconstruct/test missing migration baseline and truthful future assembly provenance, restore authorized authenticated verification, and verify a free existing generative-motion allocation. Application is NOT declared complete.
