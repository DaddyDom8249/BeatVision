# BeatVision end-to-end runtime audit — October 8, 2026

## Verification scope
Directly inspected GitHub main cdf48e31247dea768b13e0c0b688d962603aab11 and GitHub Actions logs, Vercel production dpl_5ZgZLCorEvfpjJRFbJVWkHDYT8Pg, production Supabase mdofsinyofqbeapzfygu (SQL ACLs, RLS, tables, triggers, RPC definitions, Edge Functions), Cloudflare Worker account metadata and source in DaddyDom8249/BeatVision-arena, and the unauthenticated public Ghast Style UI. Used read-only queries and public browser navigation only. **No provider generation, billable actions, creator approvals, live DML/DDL, or deployment in this audit.**

## VERIFIED infrastructure
- GitHub main SHA cdf48e31247dea768b13e0c0b688d962603aab11.
- GitHub Actions production CI run 37769371096 completed success; job test output: 45 tests, 45 pass, 0 fail, production-audit PASS and Vite build passed.
- Vercel exact target production, READY, project beat-vision, domain beat-vision-theta.vercel.app, commit cdf48e3.
- Supabase beatvision-generation Edge Function version 18 ACTIVE; current deployed source matched latest GitHub source exactly in earlier direct comparison.
- Cloudflare account lists beatvision-provider-arena Worker (modified 2026-10-08 04:49Z), with versions 455,454,453 available and configured secret binding NAMES for Arena/Pixazo/Shotstack. Configuration does not verify paid capacity, active route compatibility or media generation without a real test.

## VERIFIED project state
### Ghast — 8faa2cd4-361f-4764-bf1e-7800b87d6292
- One song: title Loyalties unmatched; analyzed; stored audio path and revision, duration 249.126908314 s (display ~249.127 s).
- Current World Report completed and explicitly confirmed 2026-10-07 21:47:05Z.
- One draft Style Bible, one draft character, three draft environments. Zero approved character/environment drafts; zero Vision Lock, Visual Plan, generated media or final video.
- Legacy projects.world_approved=false and stage=song even though canonical world_reports confirmed_at is set. Source-of-truth duplication still requires reconciliation, not fake re-approval.
- Song analysis contains eight useful contiguous windows plus a zero-length ninth trailing section (249.126875 to 249.126875). Client window selector filters zero-length windows.
### Test bug — 1f8081c7-3fb6-415e-a410-1411d6e32876
- Confirmed World, approved Style Bible, Vision Lock, approved Visual Plan with eight approved scenes covering [0,249.126875] seconds exactly and no gap in persisted aggregate.
- Eight approved scene-image assets, eight generated but unapproved motion clip assets. Zero final video.
- 8 completed image jobs and 24 failed attempts, 8 completed motion jobs and 26 failed attempts. No currently active queued/submitted/processing jobs.
- All eight completed motion outputs are shotstack/image-motion/PROCEDURAL_MOTION; persisted motion asset rows incorrectly show arena/ltx-video.

## CRITICAL: First browser-to-production blocker (P0-QUEUE)
- Both public.enqueue_scene_generation(uuid,uuid,text) and public.enqueue_assembly_generation(uuid,uuid) are SECURITY INVOKER (prosecdef=false).
- They INSERT directly into public.generation_jobs.
- production generation_jobs has RLS ON, exactly one owner SELECT policy and no authenticated INSERT policy.
- has_table_privilege('authenticated','public.generation_jobs','INSERT') is **false**, while SELECT is true.
- ProductionWorkspacePage.tsx calls these RPCs directly from browser Supabase client as signed-in user.
**Conclusion:** Signed-in web clients do not have the required permission to create new queued image/motion/assembly jobs. Historical jobs do not prove the public RPC is authorized. This is verified from deployed SQL authorization configuration, but no production enqueue attempt was made. Narrow SECURITY DEFINER RPC with explicit project-owner checks or a server-authorized equivalent is required; do not grant blanket direct INSERT on generation_jobs.

## CRITICAL: Truthful motion type is lost at assembly (P0-PROVENANCE)
- enqueuing assembly snapshot in live function stamps every motion clip with generation_type=GENERATIVE_VIDEO.
- all eight actual successful job results contain generation_type=PROCEDURAL_MOTION.
- Shotstack Worker source recognizes this type distinction, so freezing a false type can propagate false claims into assembly metadata.
**Conclusion:** must derive type from immutable job result / verified persisted provenance; unknown type = explicit stop. Historical row correction must be evidence-backed.

## HIGH: Legacy storage authorization (P0-SECURITY)
- storage.buckets: scene-images and render-manifests are public; visual-assets and songs private.
- 95 legacy scene-images objects and 5 render-manifests objects in storage.
- authenticated storage.objects policies for scene-images/render-manifests allow INSERT/UPDATE/DELETE based only on bucket_id, without owner-specific predicates.
**Conclusion:** cross-project modification/deletion is authorized at the storage policy layer. No cross-account exploit attempted. Before repair, inventory all callers/prefixes and preserve data; test negative owner cases.

## Other confirmed design defects
1. **P1-JOB-RECOVERY:** Controller poll() throws on missing upstream_job_id before try/catch, risking repeated processing; drain handles queued/processing but omits submitted; multiple db.update() errors are ignored. No currently stuck job in live DB.
2. **P1-APPROVAL:** useStyleStudio.approveAsset still refuses reference approval solely when Style Bible status is approved. Approved character/environment editors leave input/save controls exposed despite DB immutability guards.
3. **P1-WORLD-LOCATION:** useVisualPlan.firstText(world.environments) ignores arrays of setting/description objects; Ghast Plan would fall back to atmosphere as location unless fixed. Current approved Test bug plan covers duration correctly, and live validate_visual_plan_for_approval trigger checks continuous windows, numbers, lineage, song end and invalid time ranges.
4. **P1-AUTH-UX:** Unaithenticated public Ghast Style route shows Create Style Bible and "Cannot coerce the result to a single JSON object" rather than an auth gate. Source src/app/App.tsx routes directly; genuine authenticated session not tested.
5. **P1-MEDIA-PROOF:** base64 image decoding does not verify actual image format/dimensions; controller persists final output URL without independent media probing. Product may only claim media verified after actual ffprobe/image decode/playback checks, not just a URL.
6. **P2-MIGRATION:** 66 recorded live migrations vs 18 repository SQL files; scratch replay not verified. Repo lacks a dependency lockfile.
7. **P2-CI-SCOPE:** The 45-test GitHub CI result is legitimate but largely deterministic mocks; it does not substitute for authenticated browser/provider checks or creator approvals.

## True first implementation milestone
1. Snapshot policies and queue SQL / test backup.
2. Fix storage ownership and narrow creation authority for queue RPCs.
3. Regression: signed-in owner can enqueue one real draft job (no provider run), cross-account user cannot; repeated enqueue idempotent, all snapshots derived server-side. Run only on a safe, explicitly approved test project.
4. Fix assembly type, add provenance regressions.
5. Fix job-recovery and reference approval/auth UI; each after focused tests, full 45+ tests, build, and production audit.
6. Resume existing projects, never silently approve assets or spend credits.
7. Complete live playback/ffprobe validation and exact release signoff.

## Evidence URLs
- GitHub CI: https://github.com/DaddyDom8249/BeatVision/actions/runs/37769371096
- Vercel deployment: https://vercel.com/beat-vision/beat-vision/5ZgZLCorEvfpjJRFbJVWkHDYT8Pg
- Production website: https://beat-vision-theta.vercel.app/
- Canonical finish gates: docs/BEATVISION_FINISH_WORKFLOW.md

## Explicit limitations
NOT VERIFIED: signed-in browser from start to finish; new no-cost generation in current capacity window; final MP4; cross-account destructive exploit; clean migration replay; human-singing AI subject motion. No asset approvals or production state were changed by the audit. Do not call BeatVision finished.
