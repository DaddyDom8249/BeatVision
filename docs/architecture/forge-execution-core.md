# Forge Execution Core — isolated integration experiment

Branch: `feature/forge-execution-core-20261014`

AiForge's six-phase UI and file inspection inspired this **deterministic command contract**. Unlike AiForge's LocalAI phase prompts, this module does not call AI or any external provider.

## Implemented
- Typed allowlisted commands: `inspect_job`, `validate_stage`, `explain_failure`, `plan_retry`.
- Explicit project-scoped job ownership check on supplied data.
- Stage prerequisite checks and read-only retry planning.
- Node regression tests exercising transpiled TypeScript.

## Boundaries
- **Not an authenticated authorization boundary.** Supplied job data is untrusted; server-side Supabase RLS and owner checks remain mandatory.
- **Not connected to production generation UI or scheduler.** No enqueue, asset mutations, provider requests, or automatic retries.
- `validate_stage` is advisory and cannot replace database checks for Vision Lock, continuity, motion provenance, or assembly readiness.
- Existing creator approvals, approved assets and production jobs are untouched.
- No paid/unknown-cost providers, migrations, or deployment.
- Do not merge until the contract is reviewed against the existing generation controller and authenticated integration tests are added.

## Next integration step
Attach a read-only inspector to Production Workspace using project-scoped Supabase queries, with explicit loading/error states. Keep all mutation/retry decisions in existing server-side RPC and Edge Function guards.
