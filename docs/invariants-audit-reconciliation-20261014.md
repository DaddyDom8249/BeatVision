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
