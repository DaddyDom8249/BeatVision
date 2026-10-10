# Production repair verification — 2026-10-10 follow-up

Four independently verified repairs are prepared as draft PRs:

| Priority | Repair | Evidence | Production |
| --- | --- | --- | --- |
| P1 | Canonical database recovery (#58) | Full isolated Supabase PostgreSQL replay plus owner-scoped project/song/world/vision/timed-plan/enqueue contracts passed | Historical SQL restored to Git; not rerun against existing data |
| P1 | Truthful assembly provenance (#59) | Procedural, generative, unknown and immutable-snapshot PostgreSQL regressions passed | Owner-checked enqueue function deployed |
| P1 | Project creation error recovery (#60) | Three failure/retry regressions; 145 tests, audit and build passed | Primary Vercel exact tested commit 2f21f44f660f0846a8c92257c627208a393a5c44 READY |
| P1 | Client TRUNCATE privilege (#61) | Actual role-based bypass reproduced; fixed denial/CRUD/approval/default regressions passed | Zero client TRUNCATE privileges across 39 application tables |

The final security code/test commit 362d965ed6b1597fe89639c67ecbbd6cc3b0b39a passed all five CI workflows: 38054636150, 38054636161, 38054636162, 38054636142, 38054636154. Each repair's red/green evidence and deployment details are in PROJECT_LOG.md.

## Persisted production state

Ghast retains eight approved images, eight approved procedural motion clips, one completed final video, and no active jobs. Full-row hashes of its jobs, images, motion assets and final videos match their pre-repair values. No new provider request, creative approval, production project or video render was created.

Motion remains procedural image animation; it has not been verified as genuine AI subject animation.

## Remaining blockers and verification limits

1. No active authenticated production browser session is available. The live entry/bundle returns HTTP 200, but authenticated workflow execution and an OS-saved download remain unverified.
2. A confirmed free allowance for genuine AI video generation is unavailable. Do not submit unknown-cost Pixazo requests or describe procedural motion as AI subject animation.
3. Supabase-managed supabase_admin future-table defaults retain client TRUNCATE grants. Available postgres access cannot assume that privileged role. All existing public tables and future application tables created by postgres are covered by the deployed repair.
4. Canonical replay is not complete reconciliation of every older legacy migration or a full production backup/restore. Production PostgreSQL is 17.6; the isolated test uses PostgreSQL 17.11.0.004.
5. Jules is limited to the same existing task. Its follow-up was accepted, but its stale activity stream supplied no verifiable new current-scope patch, so no such patch was applied.

No automatic main merge or unverified provider/deployment change was performed. Existing deployment and branch history preserve rollback choices.
