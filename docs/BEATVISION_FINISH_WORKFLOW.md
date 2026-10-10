# BeatVision — Finish the Full Creative Pipeline
Audited: 2026-10-08. Source baseline: cdf48e31247dea768b13e0c0b688d962603aab11.
Status: **NOT FINISHED / RELEASE GATE BLOCKED**.

## Non-negotiable production contract
Song intake (title, artist, real audio, lyrics, creative direction, optional notes) -> Reveal World -> confirmed Visual World Report ("Yes, that's my world") -> immutable Style Bible -> Characters -> Environments -> Visual Rules -> References -> Storyboard/Visual Plan -> Scenes -> Images -> Motion -> Final Video.

- Supabase DB/Storage owns durable state. Vercel renders DB state; it is never the source of truth.
- Arena is a provider gateway, not a source of fictional success. Pixazo/other image generation and Shotstack are explicitly labeled. Procedural pan/zoom **is not AI human/subject motion**.
- A creator's approvals are deliberate and separate. No automated test, scheduler, coding agent, or migration silently approves World, Style, character sheets, environment sheets, images, motion, or final creative work.
- New batches append to the same approved song timeline; no duplicate scenes, gaps, overlaps, or out-of-range timestamps.
- Preserve approved lineage; any replacement requires explicit revision/regeneration. Never accept a placeholder, corrupt file, missing output, expired-only URL, or URL alone as proof of media completion.
- Provider credential or paid-capacity absence must be explicit FAILED/UNAVAILABLE. No background billable retries without an authorized cost ceiling.
- Real production execution: Supabase queue/scheduler + DB state machine -> Arena -> providers -> Supabase. Agents and GitHub Actions are only diagnostic/regression layers, never mandatory for a user's video to finish.

## Current production evidence (not extrapolated)
- GitHub main: cdf48e3; Vercel production deployment dpl_5ZgZLCorEvfpjJRFbJVWkHDYT8Pg is READY; Supabase beatvision-generation v18 active; Cloudflare beatvision-provider-arena has version 455 in recent Worker versions.
- CI run 37769371096: 45 passed / 0 failed, production-audit passed and Vite/TypeScript build passed. This is NOT a signed-in end-to-end test.
- Project Ghast (8faa2cd4-361f-4764-bf1e-7800b87d6292): audio and analysis present (~249.127 seconds); World confirmed; Style Bible DRAFT; one character DRAFT; three environments DRAFT; zero approved character/environment drafts; zero Vision Locks/Plans/jobs/final videos.
- Project Test bug (1f8081c7-3fb6-415e-a410-1411d6e32876): World/Style confirmed, one approved visual plan with 8 approved contiguous scenes spanning 0 to 249.126875 seconds, 8 approved scene-image assets, 8 generated but **unapproved** motion assets, zero final videos.
- All eight completed motion job responses say shotstack / image-motion / PROCEDURAL_MOTION. Older motion rows incorrectly say arena / ltx-video; those rows must not be presented as generative human motion.
- No active queued/submitted/processing jobs at audit.
- Existing legacy scene-images (95 objects) and render-manifests (5 objects) storage policies permit authenticated write/delete based only on bucket name and need ownership hardening; do not broadly delete them.
- Deployed public Ghast Style page, without an authenticated session, displayed "Cannot coerce the result to a single JSON object" instead of a proper sign-in gate.
- Live public.enqueue_scene_generation and public.enqueue_assembly_generation are SECURITY INVOKER; authenticated has **no INSERT grant** on generation_jobs and generation_jobs has only an owner SELECT policy. The browser's direct supabase.rpc enqueue therefore lacks insert permission. This is the earliest confirmed creation blocker at production stage.
- Assembly SQL freezes all motion clips with a hard-coded GENERATIVE_VIDEO type even when real jobs say PROCEDURAL_MOTION. This violates provenance truth.
- Repo migration directory contains 18 SQL migrations while live migration history has 66; do not claim clean-room replay until reconciled.

## Work backwards: final result and dependent gates

| Gate | Deliverable | What must be true before PASS | Current classification |
| --- | --- | --- | --- |
| G10 | Full downloadable final song video | User can play/download verified MP4, real source audio, full 249.127-second continuity, A/V streams, correct provider provenance, zero fake frames/gaps | BLOCKED |
| G09 | Final assembly | Approved motion exists for each approved scene, real media can be probed, correct generation_type frozen in the assembly snapshot; Shotstack result validated, persisted, linked and reloadable | BLOCKED |
| G08 | Approved motion | Actual clip per scene, matching duration and source image; honest distinction between procedural preview and generated human performance; explicit creator approval | BLOCKED (8 unapproved procedural clips on Test bug) |
| G07 | Approved images | Every scene has a decodable, persistent, source-attributed real image; signed URLs can be refreshed; explicit approval | PASS for Test bug at DB level; Ghast BLOCKED |
| G06 | Approved timeline/scene direction | Vision Lock exists; time windows start at 0 and end at audio duration, no overlaps/gaps or duplicates; all direction derived from approved World/Style | PASS for Test bug; Ghast BLOCKED |
| G05 | Approved cast/environments/reference assets | Drafts shown and editable, reference approval works after Style Bible lock, all changes respect approved immutability | BLOCKED |
| G04 | Approved immutable Style Bible | Creator reviews the World-derived style source and locks it; later stages remain available | PASS for Test bug; Ghast requires creator approval |
| G03 | Confirmed World | Confirmed World Report persisted and used as authority, not a legacy project status flag | PASS for Ghast and Test bug in canonical world_reports |
| G02 | Song analysis | Original audio stored, real duration and sections, analyzed song and revision bound to all subsequent outputs | PASS at DB level for Ghast/Test bug |
| G01 | Auth and project | Signed-in creator owns all reads/writes; unauthenticated users routed to sign-in; no cross-project access | NOT VERIFIED in authenticated browser; public UI defect confirmed |
| G00 | Safe infrastructure | Protected storage, secure narrow queue RPC, migrations reproducible, provider contracts reachable at zero spend | BLOCKED |

## First work to execute — not more AI generation
1. **P0 / SECURITY**: Inventory callers and the 100 legacy storage objects, snapshot policy DDL. Replace bucket-only INSERT/UPDATE/DELETE rules with exact owner/project checks; leave intended public read behavior only if an explicit product decision. Test two identities; deny cross-project. Preserve existing files.
2. **P0 / QUEUE AUTHORITY**: Replace the two enqueue RPCs with narrow, ownership-checked SECURITY DEFINER entry points (restricted EXECUTE, schema-qualified statements and safe search_path), or a similarly server-authorized server path. Do **not** grant authenticated blanket INSERT on generation_jobs. Authoritative job payloads are frozen server-side. Test own project succeeds, other owner's project fails, and repeated requests are idempotent.
3. **P0 / PROVENANCE**: Make assembly snapshot generation_type derive from the actual persisted job/provider evidence. Reject unknown types instead of inventing GENERATIVE_VIDEO. Migrate the eight historical motion labels only after validating their original job outputs. Create a regression proving procedural type remains procedural all the way into the final manifest.
4. **P1 / JOB RECOVERY**: Ensure every submitted job is either claimed/processing, retried idempotently, or terminated with a recorded reason. Missing upstream IDs and all failed DB writes must not leave zombie processing. Add concurrent scheduler/drain and durable replay tests.
5. **P1 / UI & REVISION**: Add an explicit sign-in/auth-required screen, preserve error visibility, remove the erroneous Style-locked check from downstream reference-asset approval, and make approved Character/Environment sheets read-only. Verify no approved row can be overwritten or deleted without revision.
6. **P1 / VISUAL PLAN**: Fix conversion of object-valued World environments to location strings (current firstText filters strings only). Keep a zero-duration trailing analyzed section out of the timeline. Verify DB approval guards for 0-to-duration, contiguous scene numbers, no gaps/overlaps, and matching lineage.
7. **P1 / MEDIA QUALITY**: Decode/check actual image bytes (MIME signature, nonzero dimensions and size), persist originals, refresh signing. Probe motion/final MP4 containers for duration/codec/audio and actual HTTPS availability; mark unsupported providers explicitly unavailable.
8. **P2 / REPLAYABILITY**: Reconcile 66 live migrations against 18 repository SQL files and prove fresh DB bootstrap on an isolated scratch project; add a dependency lockfile, CI build/test and security coverage.
9. **CREATOR REVIEW (not automated)**: On Ghast: review/lock Style Bible -> approve genuine Character/Environment sheets and references -> build Vision Lock -> approve plan -> approve images and motion. Never approve for the creator. On Test bug: inspect all eight procedural clips; only the creator can approve them for an intentionally procedural result. Full AI singing/subject motion remains a separate unmet acceptance criterion.
10. **END-TO-END TEST**: With signed-in authorized creator and zero-cost verified provider settings, run existing project from exact current gate to final. Check each page's actual DB transitions, queue/recovery, media, no incurred billable cost beyond user authorization. Finalize only after a real downloadable 249.127-second MP4 is played/probed.

## Deterministic execution loop after every engineering change
Inspect/reproduce -> isolate first failing gate -> snapshot/backup -> smallest safe source + migration change -> run targeted failing tests -> run npm test / npm run production-audit / npm run build -> security and cross-account regression -> deploy exact reviewed commit and migration with evidence -> read live DB state -> only then mark that gate CONFIRMED. If verification fails, roll back by reverting the exact commit and/or applying a reviewed compensating migration; never blindly reverse migrations that contain production data.

## State machine contract (server-side, not agent-driven)
- Creative stages: song -> world_unconfirmed -> world_confirmed -> style_draft -> style_approved -> cast_and_environments_draft -> cast_and_environments_approved -> vision_lock -> visual_plan_draft -> visual_plan_approved -> image_review -> image_approved -> motion_review -> motion_approved -> assembly_queued -> final_verified.
- Generation job states: queued -> submitted -> processing -> completed | failed. Terminal successes require persisted, independently verifiable real assets. Timeouts and provider-unavailable states terminate with error codes; requeue is an explicit new attempt with idempotent lineage, never silent replacement.
- Every transition carries project_id, creator ownership, current World revision, song revision, immutable Vision Lock, job id/idempotency key, provider/model/provenance, and correct scene timecodes.
- A worker may poll/process jobs automatically but never approve creative outputs. The creator presses approval controls and the database validates prerequisites atomically.
- Error surface: Stage name, job ID, provider, exact failure code, action for retry/repair. Never imply "completed" from a changing button or an HTTP 200 alone.

## Release acceptance (ALL required)
- [ ] Authenticated browser run passed on an existing project, including sign-in and reload.
- [ ] P0 queue owner RPC proved able to enqueue own project and deny other users.
- [ ] Storage legacy and canonical paths deny cross-account modification.
- [ ] World approval gate and downstream immutable asset tests passed.
- [ ] All plan scenes form an exact continuous song-length union.
- [ ] Every image/video stored, decoded/probed, and signed/refreshed from the correct project.
- [ ] Provider path true (procedural != AI human motion); missing free quota reports UNAVAILABLE, not fake success.
- [ ] Job retry/poll behavior survived interruptions and duplicate invocations without duplicate outputs.
- [ ] Shotstack assembly uses approved motion and the actual frozen generation type, and output is a playable final MP4 with correct audio/duration.
- [ ] 45 existing CI tests + targeted regressions + a separate live E2E pass on the exact production commit.
- [ ] No approved assets overwritten, no creator approvals simulated, no provider secrets in client.
- [ ] Live migration state reproducible from committed migrations, or discrepancies recorded as BLOCKED.

## Division of responsibility
- Application controller and database **run production autonomously** as designed, stop at creator approval gates, and record results.
- GitHub Actions workflow in this branch is a **read-only top-layer regression checker**. It neither generates media nor releases a deployment, grants approval, or mutates data.
- Developer/debugger inspects each recorded blocker and patches source with tests; the artist remains the decision-maker on creative approvals.
- Evidence labels: CONFIRMED (direct log/query/test), FAILED (reproduced error), BLOCKED (known prerequisite), NOT VERIFIED (no real check), PROBABLE (explained inference). No status is promoted without evidence.
