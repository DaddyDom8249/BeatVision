# PR #164 lifecycle repair evidence — 2026-10-30

This is an implementation and local verification report. Keep PR #164 draft.
No staging, production, real Modal execution, model download, GPU inference,
deployment, merge, or paid operation was performed. Synthetic media and mocked
provider calls are not evidence of generated motion or playback in staging.

## Exact baseline

The original checkout is `/workspace/BeatVision`, branch `work`, main baseline
`3e26d8556e62b40e9f20823cb253854ae5efcec6`. Repairs use the separate existing PR
worktree `/workspace/BeatVision-pr164`, branch
`fix/preserve-uncertain-dispatch-20261028`. Remote main remains the same SHA.
Remote PR head was actually `3b5d102fd5d2d357d6e34326344c670175642772`, rather
than the supplied historical `f5fd23b954beffc1c81f5705306342871e82098d`.
The intervening CLI repair and documentation were inspected, not overwritten.
The worktree was clean before this cycle. AGENTS.md and all 1,395 existing
PROJECT_LOG.md lines were read; independent review also confirmed a complete read.
PR comments contained bot preview/draft-review information and no human review
requiring a conflicting implementation. Fetch/remote-head checks were repeated
before edits and again before committing. Exact implementation SHA is recorded
in the following PROJECT_LOG publication entry; the command ledger is in that log.

Baseline checks: Node 367/367 and Python 44/44 passed, exit 0. New fault tests on
the unchanged baseline failed: lifecycle 0/9 passed, HF acceptance 2/9 passed.
The seven later worker-boundary tests also fail against the exact baseline
worker: two assertion failures and five missing-publication-helper errors.

## Blocker evidence

| Blocker | Root cause and reproduction | Repair and regression | Status and residual risk |
| --- | --- | --- | --- |
| P1-01 CLI bypass | Historical CLI called GPU `.remote` outside HTTP reservation. Already repaired in ancestor `206a00bec0beefd19916fc2b44805388b2d22c7e`; its original two-invocation reproduction is preserved in PROJECT_LOG. Current baseline already shares `_reserve_motion`. | Retained shared CLI/HTTP admission. Added atomic execution claim before model import, self-publication of the executing call ID, companion receipt lookup, conflict rejection, UUID rejection, and parent-entry-loss recovery. Real worker body is intercepted at the torch import boundary; repeated admission stops before that import. | IMPLEMENTED / TESTED containment while claims persist. Lifetime duplicate prevention is BLOCKED by reservation expiry; see the intentionally failing probe below. |
| P1-02 false terminal failure | `index.ts:poll` caught polling, database, storage and signing errors and called `setFailed`; immutable failed rows could not resume. Original injected 503, timeout, DB, upload and signing cases failed. | Infrastructure errors retain processing state, receipt and frozen input. Only explicit provider execution failure can fail a poll. Deterministic private MP4 plus authenticated proof is read back before DB checkpoint/completion. Fresh controller resumes from storage after signing/checkpoint/completion-write failure, without provider access. Legacy source hashes work. | IMPLEMENTED / TESTED. Stored-byte/container validation is not decoded motion or staging proof. Signing failure remains nonterminal. |
| P1-03 HF acceptance ambiguity | `hf-motion.ts:hfSubmit` parsed JSON and validated event ID outside acceptance containment after POST. Original malformed/missing/truncated replies failed. | One POST only; malformed, empty, oversized, interrupted, invalid-schema, missing-ID, 408, 5xx or lost reply is acceptance-unknown. Store safe status/body hash evidence, never raw reply or invented receipt. Validation before dispatch and explicit 4xx rejection remain distinct. | IMPLEMENTED / TESTED. A lost HF event ID cannot generally be rediscovered; hold for reconciliation, never automatically resubmit. |
| P1-04 starvation | `drain` repeatedly selected the same eight oldest pending jobs. The original ninth-job test failed. | Additive due-time/lease columns and service-only `claim_generation_poll`, ordered by next due time with `FOR UPDATE SKIP LOCKED`. Controller fences writes with lease token and row version, releases pending claims with bounded backoff. Three PGlite tests and 12 independent PostgreSQL sessions select 41 unique jobs, including the ninth, without overlap. | IMPLEMENTED / TESTED against isolated SQL fixtures. Full local Supabase migration replay BLOCKED by Docker disk space. No production migration applied. |
| P1-05 deadline prevents reconciliation | `poll` returned after 30 minutes before receipt lookup. Lease updates could also refresh `updated_at` and restart dispatch grace. Original 31-minute test failed. | Deadline changes cadence, not recovery eligibility. Grace uses recorded dispatch start/created time. Owner-authenticated `reconcile` uses the same lease claim and exact project/job lookup. Receipt discovery and completed-output recovery after 31 minutes pass, including a claim that refreshes updated_at. | IMPLEMENTED / TESTED. Recovery requires retained provider receipt/output or valid stored proof; deadlines do not authorize replacement inference. |
| ARCH-06 acceptance gap | Reservation, spawn acknowledgement and receipt persistence are separate operations. A caller can die before its call ID is durable. | The running worker publishes `current_function_call_id()` into an immutable atomic execution claim before model loading, independently of the caller reply. Existing claims, including same-call reentry, block another model invocation. Lookup uses matching parent/companion evidence and fails closed on conflict. Local independent-process death tests cover reservation, acceptance, receipt write, commit and lost reply. Controlled completed-manifest reconciliation is available. | PARTIALLY IMPLEMENTED / TESTED; unconditional recovery and exactly-once execution remain BLOCKED. Death before remote execution starts, unavailable persistence, output retention and expiry remain real limits. |

## Recovery and security contract

The controller keeps stable generation-job IDs, request identity, upstream receipt,
source hash, immutable snapshot and approved source-image selection. New storage
proofs bind project/plan/scene/job/source IDs, the canonical frozen-input hash,
provider/model, receipt, source/video hashes and validated MP4 metadata. They are
HMAC authenticated because a project owner can write objects in their own storage
namespace. An unsigned, altered, cross-job or conflicting proof cannot complete a
job. Fixed storage paths are checked; uploads do not overwrite existing objects.
Existing motion assets are reused without changing approval or rejection.

Set the server-only `MOTION_CHECKPOINT_SIGNING_KEY` before creating checkpoints
when service-role key rotation must be independent of checkpoint verification.
Otherwise the existing service-role secret is the signing-key fallback. Changing
the selected signing key later invalidates old proofs and fails closed; an
explicit verified proof/key migration is needed. Never bypass validation or
resubmit inference to work around a key change. No secret values were printed.

The migration adds `next_poll_at`, `poll_lease_token`, `poll_lease_until`, a partial
index and a privileged claim RPC. PUBLIC/anon/authenticated execution is revoked;
only service_role can call it. Existing client mutation grants and owner SELECT
RLS remain unchanged. Owner endpoints authenticate and check `projects.owner_id`
and job/project binding before claim or provider access. Unauthorized owner tests
return 404 without a provider call. Stale tokens cannot update a newly claimed row.
Provider hosts remain pinned where already pinned; redirects are disabled. Arena
configuration rejects HTTP, userinfo, literal/private-local forms and unusual
ports. This is not a proof against DNS rebinding of an administrator-configured
domain. Transport/provider reply details are not persisted as infrastructure errors.

Fairness assumes recurring scheduler execution, finite lock holding and a finite
backlog or sustainable arrivals. Each claim advances next eligibility, so the
same eight holds cannot retain the earliest due positions. Baseline cadence is
30 seconds, overdue reconciliation at least 300 seconds, exponential infrastructure
backoff capped at 900 seconds. Leases expire after two minutes. Eight serial
network polls can exceed that lease; token/row-version fencing and unique assets
contain stale completion, although duplicate GET/status retrieval is possible.
This never authorizes a new inference submission.

## Controlled manual recovery API

The existing authenticated generation endpoint accepts the additive action:

```json
{"action":"reconcile","projectId":"existing-project-uuid","jobId":"existing-job-uuid"}
```

This performs only existing-receipt/output lookup, respects due time and leases,
and never submits replacement inference. Existing completed jobs use `motion_url`
to refresh presentation URLs without changing their completed status.

If an operator has independently located a Modal call ID, the owner may supply
`"receiptId":"fc-existing-call"` with the same request. A running candidate is
not sufficient proof. Adoption requires completed output with the exact frozen
job/project/scene/source IDs, approved source hash, pinned model/revision, real
video hash and `creator_approved:false`. Conflicting known receipts return 409.
Other-job results are rejected without creating an asset or inference request.
Do not guess IDs, clear holds, reset jobs to queued, or use new variants as an
automatic substitute for an unresolved accepted execution. HF unknown-event
holds have no invented manual event ID or automatic replacement path.

## Crash map and provider limits

| Interruption | Durable evidence and permitted recovery |
| --- | --- |
| Before reservation commits | No accepted reservation is assumed; a later first admission can win the atomic claim. |
| Reservation committed, reply lost or spawn not reached | Unknown hold; do not spawn again. May strand zero-execution work rather than risk duplication. |
| Spawn accepted, caller loses reply | Hold until the running worker publishes its actual call ID, or a completed operator candidate proves identity. |
| Worker starts but persistence/admission fails | Stop before model import. Keep the reservation. No automatic replacement. |
| Execution claim committed, convenience receipt write fails | Matching execution claim contains the call ID; lookup recovers it, same-call reentry is refused. |
| Caller receipt persists but database checkpoint fails | Recover via existing Modal receipt lookup; no POST. |
| MP4 stored, proof not stored | Retry retrieval of the same accepted output. Retention remains an external dependency. |
| MP4 and proof stored, database receipt/checkpoint missing | Verify HMAC, full immutable lineage and stored bytes, then adopt receipt and resume presentation. |
| Asset inserted, completion write fails | Reuse the existing asset without changing creator approval; retry conditional completion. |
| All provider admission records expire | Lifetime protection is lost. A CLI retry can submit again. This is a release blocker, not solved by another flag. |

Public provider documentation was fetched read-only on 2026-10-30:

- [Modal Dict](https://modal.com/docs/reference/modal.Dict): “An individual Dict entry will expire after 7 days of inactivity (no reads or writes).” It describes durable storage and `put(skip_if_exists=True)` returning false for an existing key. Older pre-2025-05-20 Dicts have different, weaker retention/storage behavior. The actual remote Dict configuration was not inspected.
- [Modal Function](https://modal.com/docs/reference/modal.Function): `spawn(self,*args,**kwargs)` returns a FunctionCall. No application idempotency-key or lookup-by-BeatVision-ID guarantee was established from this interface.
- [Modal FunctionCall](https://modal.com/docs/reference/modal.FunctionCall): `from_id` requires an existing call ID.
- [Current call ID](https://modal.com/docs/reference/modal.current_function_call_id): available inside the executing container; this supports conditional self-publication after startup, not atomic reservation-to-start.

The local-only `expired_reservation_probe.py` deliberately removes mock admission
records to simulate expiry, retries the same CLI ID, and asserts one invocation.
It observed **two mocked submissions**, assertion failed, **exit 1**. It is kept
as explicit negative evidence outside the passing test suite. No production data
or provider was touched. A non-expiring authoritative admission ledger shared by
every entry point, or a provider-supported permanent idempotency mechanism, is
still required for a lifetime guarantee. Do not call this exactly-once execution.

## Verification and review

Final local suites: **410/410 Node**, **60/60 Python**, zero suite skips. Added Node coverage
includes lifecycle faults, HF acceptance ambiguity, fair SQL claims, safe URL and
credential handling, manual ownership/provenance rejection, legacy checkpoint
recovery and key rotation. Python adds independent-process SQLite-backed admission
and process-death tests plus worker self-publication/admission/conflict cases.
SQLite/PGlite and mocked Modal are not evidence of real Modal cross-container
semantics. Actual PostgreSQL 16 fixture verification used 12 independent sessions;
41 jobs were claimed once, including the ninth, and stale writes affected no rows.

Production audit, frontend TypeScript/Vite production build and Edge Deno check
passed. Edge checking used installed Supabase declarations and a temporary copy
of the unchanged image module with a PNG type annotation to work around vendor
type resolution; this is not a deployed Edge runtime check. A Deno auto-install
temporarily introduced Node timer declarations into frontend dependencies; the
verified npm setup was restored and the build passed again. The existing Vite
bundle-size warning remains.

Full Supabase PostgreSQL 17 migration replay was attempted using the repository's
CLI version 2.120.0. Docker could not unpack image `17.11.0.004`: `no space left on
device`. The CLI's retries were stopped (exit 130). This is a specific local
verification blocker. The smaller PostgreSQL fixture checks passed and their
concurrency check is now in CI. No application migration was applied to production.

Independent source review found four repair issues during development: lease
updates resetting dispatch grace, orphaned signed proofs, parent/companion receipt
conflicts and legacy source-hash fallback. All received fixes and regressions.
The final reviewer reported no further concrete defect in the reviewed patches,
while explicitly leaving real Modal and staging verification unverified.

Next engineering action: establish a non-expiring authoritative admission protocol
for CLI/HTTP/remote execution without weakening ownership or unknown-acceptance
holds; replay all migrations on an isolated database with sufficient disk, then
perform explicitly cost-verified, controlled staging recovery tests. Keep PR draft.
