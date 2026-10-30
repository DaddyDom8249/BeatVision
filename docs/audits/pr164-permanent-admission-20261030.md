# PR #164: permanent Modal admission, 2026-10-30

Keep this PR draft. This is an implemented and locally tested repair; staging,
actual Modal cross-container execution and production are NOT VERIFIED.

## Exact baseline and scope

Remote PR head before edits and again before commit:
`d735fb5f96cb18cef980748d05b255e60f22f6fc`, branch
`fix/preserve-uncertain-dispatch-20261028`. Remote main and the untouched original
checkout remain `3e26d8556e62b40e9f20823cb253854ae5efcec6`. Worktree:
`/workspace/BeatVision-pr164`. Repository instructions and the complete project
log were read before modifications. No concurrent branch advancement was found.

This change replaces finite Modal Dict admission authority with PostgreSQL. It
does not replace the creative workflow or the earlier lifecycle repairs. Their
root causes, deterministic reproductions and status remain in
[the lifecycle report](pr164-lifecycle-repair-20261030.md). This report supersedes
that report's unresolved **Dict-expiry** finding for protocol-2 workers, subject
to retained database history and a controlled cutover of every execution path.

## Reproduction and smallest repair

| Field | Evidence |
| --- | --- |
| Root cause | `worker.py::_submission_receipts()` used Modal Dict for both submission and model-entry permission. Expiry removed the only admission history. |
| Before | `expiry-red`, exit1: the unchanged baseline admitted **two mocked GPU invocations** for the same CLI job after simulated Dict expiry. No real inference occurred. |
| Repair | New `admission.py` uses one bounded service-only PostgreSQL RPC. Migration `20261030204115_durable_modal_admission.sql` retains a permanent row per generation-job UUID, request fingerprint, normalized request, owner/project/scene/source, winning random token and provider receipt. No TTL, cascading deletion or reclaim operation exists. |
| Atomic ownership | `reserve` locks the canonical generation job and grants the first insert once. Every existing reservation, including same-token retry, returns false. `begin` grants model entry once before torch import. A unique provider-call constraint and legacy receipt checks prevent cross-job replay. |
| Entry points | CLI and HTTP use the same factory and reservation function. The GPU function consults the same permanent ledger independently. Modal Dict is forbidden by the real-factory regression. Missing configuration, failed writes, uncertain replies and malformed grants stop admission. |
| Recovery | Unknown claims remain held. An executing worker can publish its actual call ID before model loading. Late receipt writes merge without erasing the execution fence. Receipt conflict HTTP409 stays processing with reconciliation required; no automatic POST retry. |
| After | PostgreSQL16: 20 independent mixed CLI/HTTP processes produced **one mocked provider submission**. A 100-year-old retained claim, four process-death boundaries, lost execution-claim reply, same-call reentry, actual database stop/start and actual outage all preserved duplicate containment. |
| Security | Private RLS-enabled table; anon/authenticated cannot execute RPC; anon/authenticated/service_role cannot directly delete it. Service-role credentials stay server-only; HTTPS origin is restricted to Supabase, redirects rejected, network errors sanitized. Current owner, immutable prepared payload, pinned model/revision, source hash and approvals are checked at reservation and model entry. |
| Commit / status | `6f28b1a6e87cbda583b15c0487541e5ada07feda`: **IMPLEMENTED / TESTED** for permanent admission under the stated assumptions. Unconditional exactly-once execution and completion remain **NOT VERIFIED / provider-boundary BLOCKED**. |

Independent review found two additional authorization hazards during this change:
SQL NULL operation flags could bypass boolean guards, and model entry did not
revalidate current scene/source/model/approval lineage after reservation. Explicit
NULL rejection and current-lineage checks fix these. The lineage regression was
executed before its repair: exit1, `Missing expected rejection`; it then passed
all eight mutation variants. The healthy controller regression also verifies the
prepared dispatch payload survives receipt persistence.

## Regression and verification evidence

- **421/421 Node tests**, zero skipped, exit0. Baseline:410/410. Added nine SQL
  ledger cases, one legacy-protocol adapter rejection and one controller409 hold.
- **67/67 Python tests**, zero skipped, exit0. Baseline:60/60. Added seven
  transport/configuration/fail-closed/factory cases; existing concurrency and
  crash tests remain enabled.
- SQL tests cover permanent grants, same-token retry, late receipts, concurrent
  receipt uniqueness, cross-job replay, disk restart, legacy holds, deletion
  tombstones, client privileges, invalid tokens and eight post-reservation
  lineage/approval changes. Parallel receipt uniqueness is enforced by the
  database constraint; the dedicated SQL replay regression is sequential.
- Independent-process PostgreSQL runner exercises real CLI and ASGI HTTP code,
  production client JSON validation and actual SQL sessions. Its HTTP-to-RPC
  transport is an injected psql opener; it does **not** verify live PostgREST,
  Modal SDK, containers or provider authentication. Provider spawn and video
  bytes are explicitly mocked. The PGlite tests are additional SQL coverage.
- `after_reservation`: process exits after committed reservation, before spawn;
  retries create zero submissions. `after_acceptance` / `before_receipt` /
  `after_receipt`: one recorded mock submission survives caller death and retry.
  `after_execution`: process exits after committed model fence but before reply;
  receipt discovery succeeds and same-call reentry is denied. Independent workers
  use `os._exit(42)`; expected fenced reentry exits43.
- PostgreSQL was stopped, the production admission client failed closed with no
  mocked spawn, then restarted; all five fixture claims survived and retries
  added zero submissions. Explicit role-denial checks also passed afterward.
- Production audit, TypeScript/Vite production build, Edge Deno check, Python
  compilation and diff checks: exit0. Existing Vite917.86kB bundle warning remains.
  Edge check uses installed vendor declarations and a temporary PNG typing
  annotation, as explained in the earlier report; it is not a deployment check.
- The candidate migration applied to isolated PostgreSQL16 and PGlite, exit0.
  Full Supabase17 replay passed on published implementation6f28b1a in GitHub CI,
  together with all three other workflows (links in `PROJECT_LOG.md`). Local
  full replay remains unavailable after the previously documented
  Docker image unpacking disk exhaustion; it was not retried blindly.
- Independent second source review challenged lineage, receipt replay, factory
  wiring and failure classification. Identified issues received fixes and
  regressions; final read-only review found no additional concrete defect.

The first Python run exposed a missing `FakeModal.Secret` test stub (fixed). The
first real PostgreSQL fixture used hexadecimal UUID suffixes rather than the
fixture's decimal-looking IDs; authorization correctly refused it. Fixture IDs
were corrected without weakening authorization. A final Node run in a network-
restricted sandbox failed its unchanged local-browser layout test; the isolated
test and full suite passed with local network permission. Nonzero evidence is
retained in the command ledger, not counted as passing validation.

Exact commands, UTC execution times, working directories, exits, versions and
complete changed-file inventory are appended to `PROJECT_LOG.md`. Raw records
are in `/workspace/beatvision-admission-repair-20261030`; they are local artifacts.

## Crash consistency and remaining release gates

| Boundary | Durable evidence and safe action |
| --- | --- |
| Before reservation commit | No grant exists; a later first reservation may win. |
| Reservation commit, reply lost | Permanent hold; never infer permission from a missing reply. |
| Reservation committed, before provider invocation | May strand zero-inference work; no automatic replacement. |
| Provider invocation/acceptance, receipt absent | May be running; retain unknown hold and reconcile only existing execution. |
| Worker begins | Actual call ID and one-shot model fence commit before model imports. A lost acknowledgment blocks reentry, even if inference never ran. |
| Model execution/output interrupted | Fence persists. Resume existing receipt/output retrieval when available; never create replacement inference. |
| Output upload/signing/polling failure | Earlier nonterminal recovery, durable output proof and owner-safe reconciliation remain in place. |

The database transaction and provider invocation are still separate. This design
chooses containment over reclaiming an uncertain claim. Neither a database flag
nor a fabricated receipt establishes provider idempotency. Modal documentation
review established no unconditional stable rediscovery guarantee across every
pre-start interruption; real runtime behavior is not tested here. HF lost-event
recovery remains provider-limited as documented in the earlier report.

Protocol2 is an explicit internal contract change, documented in
[the worker guide](../../providers/modal_motion/README.md). Existing Modal jobs
(including queued ones) become permanent legacy holds; known database receipts
are retained. Old-protocol jobs discovered later also become holds. Operators
must not reset these jobs or clear their admission records. Standalone arbitrary
CLI proof UUIDs can no longer authorize execution; execute requires an existing
approved, controller-prepared job. Dry-run remains local.

A new ledger cannot constrain old binaries that never consult it. Before any
future execution, freeze admission and disable/drain/revoke old controller,
web-worker, private-function and operator-CLI paths, then verify all use the same
ledger and revision. Protocol2 in the parsed payload makes new requests fail
closed on old workers; it is not proof old workers have stopped. Server-only
ledger credentials and the additive schema must exist before enabling requests.
This change neither configures credentials nor deploys the migration.

Retained authoritative database history is required. Deleting/restoring away
ledger history defeats the guarantee; backups and operator retention must be
verified separately. An in-function fence also occurs after Modal has allocated
a container; arbitrary raw SDK calls are not a no-cost guarantee.

**Next engineering action:** review an isolated staging cutover and CPU-only
PostgREST/Modal authentication and recovery test plan, with explicit cost proof
before any provider invocation. Verify old-worker shutdown and retained-ledger
restoration behavior before considering controlled inference. Keep PR #164 draft.
No merge, deploy, production mutation, actual GPU or paid service was performed.
