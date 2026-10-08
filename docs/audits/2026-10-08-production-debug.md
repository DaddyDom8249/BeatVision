# BeatVision production debug — 2026-10-08

## Scope and baseline

Inspected GitHub main `7aa50b3c45b56cb48bc7a6d4e88bc7a924d556bf`, its Vercel production deployment `dpl_GUwtWk4puFJE2jYgeaoAAiYpzAUs`, live Supabase tables, policies, job records, and deployed Generation v17. Live function source matched Git except trailing whitespace. No new generation, creator approval, project creation, paid call, or production data deletion was performed.

## Root causes confirmed

1. **Browser transport broken:** Generation returned HTTP 405 for OPTIONS from the actual production origin, with no Access-Control-Allow-Origin. The frontend uses `supabase.functions.invoke`, which requires preflight. The scheduler does not use browser CORS, explaining why server-driven jobs can run while website calls fail.
2. **Async state tracked through completed assets:** ProductionWorkspacePage checked `motion.generation_job_id` and rendered its status button only when a motion asset had status processing. Assets are inserted only after completion. The pending job was therefore inaccessible. Assembly also kept its initial queued state instead of the returned processing state.
3. **Recoverable state hid all controls:** `if (error || !plan || !scene)` replaced the workspace. Normal processing messages were stored as errors. A real-source DOM test reproduced a page asking the user to check status while hiding that status button.
4. **Private image links expired:** all eight scene image assets have storage paths, but their persisted signed URLs expired between 00:33:04 and 00:34:05 UTC on October 8. UI selected neither storage_path nor a new signed URL. Generated paths start with project ID, while existing visual-assets storage policies expect user ID; signing therefore needs an explicitly owner-authorized server path.
5. **Incorrect motion provenance:** all eight completed motion responses say provider shotstack, model image-motion, generation_type PROCEDURAL_MOTION. All eight asset rows instead say arena / ltx-video. The persistence code hard-coded the requested model, confusing requested generation with delivered output.
6. **Completion classifier could override failure:** an image URL was accepted before checking explicit failed status; `ok:false` was ignored. Runtime tests reproduced both misclassifications. No claim that these edge cases occurred in production.
7. **Verification gap:** baseline npm test was 30/31, failing a source-regex assertion made obsolete by the base64 image path. Production CI ran build and directory checks but not npm test. The static production-audit script alone does not test a real production workflow.

## Repairs

- Allowlisted CORS preflight and CORS headers on all controller responses; existing authentication/ownership checks retained.
- Added image_url action: authenticate, verify project owner, constrain asset lookup to that project, sign the saved private storage path. No public bucket or RLS weakening.
- UI tracks image/motion/assembly jobs independently of assets, restores pending jobs from DB, refreshes pending state, retains controls on recoverable errors, and refreshes private images.
- Assembly display is bound to the active plan's completed job rather than a project-wide unrelated final-video row.
- Explicit failure takes precedence over media presence; actual provider/model are saved for future motion outputs. Existing historical rows were not rewritten.
- UI labels procedural fallback from recorded job evidence; it does not label it AI subject motion.
- Replaced brittle state regex tests with execution of real TypeScript; added DOM regressions and cross-project image-signing denial tests.
- Production CI now runs the tests and existing architecture audit.

## Verification

- Five new controller regressions failed before repair, then passed.
- Four initial DOM regressions failed before repair, then passed; assembly tracking regression added and passed.
- Full repaired suite: 45/45 passed. TypeScript/Vite build passed. Existing static production-audit passed. git diff --check passed.
- Supabase Generation v18 deployed; retrieved source matches repaired source exactly after trimming trailing whitespace.
- Live production-origin OPTIONS: 405 before, 204 after, correct allow-origin and authorization/apikey/content-type headers.
- Live unauthenticated POST: 401 after repair, with CORS headers. Untrusted origin: no allow-origin header.
- Sample completed motion job c15ef93e-3357-40ea-9121-af517faae177: ffprobe successfully opened its Shotstack stage URL; H.264, 1280x720, AAC audio track, 7.807667 seconds. This verifies a playable media container, not visual quality, lip sync, or all eight clips.

## Actual production state at audit time

- All generation jobs belong to Test bug: 8 completed images, 24 failed image attempts, 8 completed motion clips, 26 failed motion attempts. No active queued/processing jobs in the grouped result.
- All 8 motion clips are generated, unapproved, with 8 distinct URLs. Every completed response records PROCEDURAL_MOTION.
- Earlier motion failures include Pixazo HTTP 402 asking for a card, missing upstream job IDs, and an ambiguous job_type SQL reference. Later successful jobs supersede those attempts; historical errors are not proof of a current outage.
- Ghast has one world report and a world confirmation timestamp, but zero Vision Locks and zero Visual Plans. Its stage column still says song. No stage was advanced or approved by this audit.
- final_videos contains zero rows; no assembly jobs appear in the generation-job totals.

## Remaining risks and limits

- **NOT VERIFIED:** authenticated live browser run from song through final output. Tests use mocked auth/provider boundaries; no creator session was used.
- **NOT VERIFIED:** real LTX/AI subject motion; the completed clips are procedural fallback. No new provider call was made because zero-cost eligibility was not verified.
- **CONFIRMED policy risk:** legacy scene-images and render-manifests storage policies grant authenticated INSERT/UPDATE/DELETE by bucket name alone, without ownership checks. This is separate from the canonical private visual-assets path. Cross-account exploitation was not attempted; caller/path inventory is needed for a safe targeted policy replacement.
- **Source-of-truth risk:** live migration history and repository migration timestamps differ; scheduler and later lineage changes are not fully represented in the live migration ledger. A fresh database replay was not performed.
- **Lifecycle risk from inspection:** controller can retain processing jobs without upstream IDs and ignores some database update errors. Concurrent polling/idempotent persistence needs further targeted testing; no blanket reliability claim.
- Build reports a large JavaScript chunk warning. No npm-ci reproducibility claim: the repository intentionally excludes a lockfile and uses npm install.
- Previous Pixazo-balance-only diagnosis is stale: later image and procedural motion fallback outputs are persisted. This does not establish that Pixazo itself is usable.

## Publication status

Backend v18 is deployed and verified as described above. Automatic approval review rejected both the direct main push and the subsequent review-branch push, citing lack of explicit authorization to publish repository changes to GitHub. At that checkpoint no repository publication succeeded, frontend and CI repairs remained local, and the production frontend was still baseline 7aa50b3. The lower-risk branch attempt was also rejected; no alternate publication mechanism was attempted afterward.

On the following turn, the user explicitly approved publishing these fixes to GitHub and deploying the frontend. Publication proceeds through the connected GitHub account because the local Git client has no HTTPS credentials. The tested application changes are unchanged.
