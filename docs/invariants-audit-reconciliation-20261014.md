# Invariants audit reconciliation — 2026-10-14 UTC

Source: supplied `beatvision-invariants-audit.md`, whose checkout does not record an exact commit or live database inspection.

## Preserved production

Production frontend currently serves bc75c8748db340bb448edeef88b9ff1e6d8defad (`repair/production-reconcile-20261012`, deployment dpl_8HpBmEbsVU1ge3wuhNFmEux2yGYw). This includes PRs 85–87 (style/world lineage, authenticated failure diagnostics, terminal ZeroGPU ticket handling), newer than the original LTX repair. Controller remains version 30. This repair combines that production branch with PR 84; the sole merge conflict was append-only PROJECT_LOG history, both sides retained. No main merge, production deployment, migration, approval change or provider generation request.

## Findings and disposition

| Audit finding | Current disposition |
| --- | --- |
| C1: arbitrary URL/provider duration becomes a complete final video | Confirmed and repaired in candidate. Download bounded actual bytes; configured HTTPS output host only; redirects rejected; require MP4 video samples, audio samples and measured video/audio durations within 0.5 seconds of frozen plan. Planned duration is never an output-duration fallback. Existing final rows reused without mutation. |
| H1: failed assembly retry blocked by fixed idempotency key | Remaining; retry semantics need a separate explicit attempt design, preserving frozen inputs and prior jobs. No paid renderer invoked. |
| H2: asset rejection/regeneration/history and query scoping | Remaining product/invariant work. New LTX clips append without overwriting approvals, but comprehensive creator history is not implemented. |
| H3: image selection/provenance | LTX completion is bound to frozen approved source image; generic image approval uniqueness and older motion lineage still require investigation. Do not blindly add a unique index over existing approved rows or mutate immutable snapshots. |
| H4: VisualPlan revisions/uniqueness | Remaining. Requires schema/data reconciliation before migration. |
| H5: zero-cost provider gates | New motion requests fail closed to verified LTX ZeroGPU, no legacy paid fallback. Other provider paths are not certified by this work; environment allowlisting alone cannot establish free eligibility. |
| M1: complete timeline coverage at database boundary | Remaining. Two-second LTX preview is not full-scene coverage. |
| M2: old song audio deleted before save | Stale for current production: replacement retains old persisted audio; failed save cleans only new upload. Preserve frozen references. |
| M3: atomic analysis/plan writes | Remaining investigation. Column REVOKE alone is insufficient if table-level UPDATE grants remain. |
| M4: initial scene contents/lyrics | Remaining content pipeline work. |
| M5: missing canonical migrations/RLS | Stale for production branch: canonical generation/image/motion/final-video migrations and recovery fixes exist. Their presence does not certify every live RLS invariant. |
| L1: image encoding/decode validation | Remaining. |
| L2: procedural assembly marked generative | Addressed by production migration 20261010070000_assembly_motion_provenance.sql; preserve it. |
| L3: missing motion route/stale jobs | Motion route exists. HF polling has a 30-minute deadline; production PR87 handles terminal preview tickets. Other job classes need separate timeout review. |

## Verification and limits

A local deterministic two-second H.264/AAC fixture tests the media contract; it is a black test clip, not generated character motion, and is never a creator asset or production output. Tests reject HTML, truncation, unreachable responses, unconfigured hosts, wrong measured duration and missing audio; invalid output cannot create a final_video row. Existing completion tests now fetch actual fixture bytes and intentionally report an incorrect provider duration to verify measured duration wins.

This guard is structural MP4 verification, not a decoder, proof of subject motion, singing accuracy, audio identity, timeline content or visual quality. Production completion/playback is UNVERIFIED. Existing real Ghast LTX output evidence remains in docs/providers/huggingface-free-motion.md; this repair makes no new AI generation claim.

Deployment requires explicitly configuring `FINAL_VIDEO_ALLOWED_HOSTS` with exact reviewed renderer output hostnames (comma-separated, no wildcards) after provider cost/permission checks. No default host is trusted. Missing configuration fails closed. HTTPS output fetching sends no provider credentials. Whole-object verification is capped at 50 MiB / 30 seconds; larger output, fragmented/non-H.264 MP4, unsupported timing metadata fail closed rather than becoming complete. Existing completed final assets are not rewritten.


## Follow-up implementation — 2026-10-14 UTC

Repair branch `repair/invariants-recovery-20261014` starts from f2425dfc (PR88), retaining production bc75c87 plus LTX PR84. Live World39, StyleDraft7, AnalyzeSong18 and WanPilot4 sources exactly match production Git; generation30 remains the deployed LTX repair. Main remains 9e6619f.

Implemented repairs:
- H1: serialize assembly attempts on the plan row; preserve failed jobs/snapshots and append a new attempt; replay active/completed attempts. A local SQL regression reproduced the old failure first.
- H2/H3: fetch scoped asset history, prefer existing approval by default, let the creator inspect/reject generated variants, append image requests with stable UUIDs. Motion explicitly pins the selected approved source and supports immutable model/source/request-specific attempts. New approval cannot supersede existing approved imagery/clips; plan revisions provide the intentional change path. No existing approvals demoted and no unique index imposed over legacy approvals.
- H4/M3/M4: additive plan revision metadata, atomic create/copy RPCs, old approved rows/scenes/assets intact, editable timing, history links and older-plan production access. Plan defaults retain structured World/Style directions and overlapping timed transcript segments. Owner-checked, audio-revision-bound DSP RPC replaces direct analysis writes; removes unverifiable transcript claims. Direct analysis and non-atomic plan inserts restricted at the same frontend release boundary.
- M1: server approval validates continuous numbered scenes and the total against frozen song duration; no retroactive edits to old approved plans.
- L1: actual bounded JPEG/PNG decoding, truthful content type/extension, dimensions/decompression limits; no minimum-byte rule that rejects valid small images. Read-only approved-image preflight exercises this with existing private storage.
- L3: story/video aliases render actual workspace pages; provider work expires from acceptance age, irrespective of recent polls. Failure races retain concurrently completed jobs. Failed DSP plus unavailable transcription releases the analyzing state for retry.
- H5: new unverified image/assembly/legacy motion requests cannot reach providers. New Wan requests paused; old signed-ticket status reads retained. Groq/Gemini/OpenRouter account eligibility cannot be certified from key presence; new transcription/World/description inference explicitly unavailable, preserving saved creative state and local DSP. No configuration allowlist presented as proof of free eligibility. LTX remains the verified motion path.
- S/C1: reviewed/imported server-only final-video write migration from the independent final-media/RLS branch, preserving the actual-byte guard rather than replacing it with provider assertions. Asset approval rejects missing auth subjects. New privileged RPC search paths put public before pg_temp.

Validation: 231/231 local tests passed, build and production-audit passed, separate Edge TypeScript check passed with platform/dependency declarations. PostgreSQL tests execute the actual migration/RPC bodies in PGlite; foundational project/World/Style tables and the Vision Lock dependency use isolated test fixtures. These tests do not prove live multi-session concurrency or authenticated Studio behavior. JPEG/PNG decode tests use actual codecs; the MP4 black fixture remains contract-only, never AI evidence.

Release boundary: Supabase organization gxhotrxgisoxwunexmeg verified free/tier_free. Vercel get_team omits billing-plan evidence. Optional account-plan questions returned no answers; eligibility remains UNKNOWN, not approval. Hold frontend and migrations 214/215 together until hosting eligibility is known. Independently compatible migrations 210–213 and controller safeguards can release on verified free Supabase. Full assembly, new image inference and singing remain blocked/unverified. No new GPU/render inference performed in this work cycle.

Jules: reused only sessions/11067167063386264554 for scoped retry implementation/review; API history is bounded at 1000 activities and exposes Oct10 evidence. No stale patch or claimed completion accepted.


Release reconciliation update: discovered Vercel get_git_deployment_context, which confirms the primary team/project on Hobby (free, hard limits rather than automatic paid overage). Hosting eligibility is now established for this existing personal project. Groq account tier remains unverified. Concurrent production PR89 advanced the repair branch to ead934c and controller31; preserved its probe/host/duration requirements, imported tests and original RLS migration, and combined with independent downloaded-byte validation and measured probe/byte agreement. Removed only our redundant unapplied RLS migration. Reconciled candidate passes 237/237 tests, build and production audit; no main merge. Coupled plan/analysis migration and frontend release can proceed after this exact candidate's checks; actual deployment/proof recorded next.
