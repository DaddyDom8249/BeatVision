# Canonical schema recovery — 2026-10-10

A clean database could not replay BeatVision's canonical pipeline. The repository omitted applied Vision Lock, generation job and asset prerequisites; its legacy project/song baseline also did not match the application's current API.

## Direct failure evidence

- Initial replay: missing public.generation_jobs (prior diagnostic Actions 38050731498).
- Restored core history: missing private.beatvision_generation_scheduler_config before the secret RPC (38052583363).
- Real extension replay: missing public.final_videos (38052953444).
- Next replay: missing generation_jobs_canonical_job_type_check (38053127900).
- Complete DDL replay: project creation fails on missing projects.stage (38053270771).

## Repairs

Seventeen canonical migrations were copied verbatim from the live applied-migration ledger, with filenames matching their recorded versions. Four additive prerequisites restore scheduler creation order, final-video table creation, song-analysis fields and project API compatibility. The legacy owner column remains synchronized with owner_id; production enums and persisted records are retained.

Historical SQL must not be manually rerun on an existing production database. Recovery files do not establish that every older legacy migration is reconciled, nor replace a full backup.

## Verified result

Commit a4e9f58d6ea38d61ca3e629e6858b1bbf30964e8 passed Actions 38053857660 (job 114218228098). The test uses an isolated Supabase PostgreSQL 17 database with actual pg_cron and pg_net extensions. Scheduled jobs are disabled before loading application migrations, preventing calls to the production generation endpoint.

The database-role smoke test verifies project and song API shape, ownership isolation, world confirmation, explicit style approval, Vision Lock creation/immutability, timed scene approval, idempotent image-job enqueue, rejection of assembly without approved motion, audio-revision invalidation and retained frozen song snapshots.

The 142 Node tests, production audit, build, generation-enqueue security and storage-ownership security checks also passed on that commit.

## Limits and next priority

This is a database-role and repository test, not a production browser login, paid-provider request, real AI animation, or downloaded-file verification. Existing Ghast motion remains procedural. Production's existing canonical definitions were inspected; no historical migration or creative state was rewritten there.

The next independent security investigation concerns application-client TRUNCATE privileges. RLS alone does not protect this operation.
