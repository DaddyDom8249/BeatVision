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


## Staging cutover gate — prepared 2026-10-30 (read-only verification)

Current GitHub head at preparation: `fe2036ca50e150b7ffe8b4aab6706202f2979c1f`, four PR checks successful. Connected production Supabase migration history was inspected read-only: `20261030204115_durable_modal_admission` is **not applied**. No migration, service deployment, paid capacity, or GPU inference was initiated.

**Important test-harness limit:** `providers/modal_motion/tests/staging_worker.py` currently uses isolated Modal Dicts and synthetic fake receipts, not `PostgresReceiptStore`. Its 20-request result can validate the *old contention protocol only*. Do not count it as a protocol-2 staging acceptance or recovered-job proof.

### Requirements before an isolated protocol-2 staging test

1. Use a dedicated, non-production Supabase database/project with verified cost and migration version `20261030204115`. Back up and retain its admission ledger. Never run the new migration on production as a test.
2. Build a CPU-only staging runner for the **actual** protocol-2 reserve/receipt/begin/lookup entry points and the exact `PostgresReceiptStore` RPC transport, replacing the current Dict-only test app or clearly labeling that app as legacy-only.
3. Configure narrowly scoped staging proxy credentials and exact HTTPS staging origin. Credentials stay server-side; block redirects; never write tokens to test logs. Use fake model execution to avoid real GPU calls.
4. Explicitly inventory all old deployed controller, HTTP worker, GPU function and CLI binaries. Freeze admissions and verify old versions are shut down or access-revoked before enabling protocol 2. A newly deployed worker does not by itself disable an old one.
5. Verify 20+ independent clients and at least two containers converge on one ledger row, one accepted admission and at most one fake model start; verify fingerprint conflict, unknown acceptance, ledger outage, DB restart, receipt mismatch, worker restart, old-protocol hold and retained-history restoration.
6. Confirm Modal CPU and Supabase staging costs **before** creating/deploying any resources; require explicit founder approval for known costs. Store executed commands, exit codes, redacted provider receipts and observed containers in PROJECT_LOG.md.
7. Keep the PR draft and block GPU inference until the actual staging protocol-2 checks pass, old worker shutdown is independently confirmed and a separate spend-limited GPU test is authorized.

**Readiness classification:** CI VERIFIED; protocol-2 staging NOT BUILT/NOT EXECUTED; production migration ABSENT; old workers NOT INSPECTED; GPU/Android output NOT VERIFIED.

## Protocol-2 CPU runner — implemented and locally tested 2026-10-30

Continued from confirmed remote43ab6eb5e096da2fde02ca7adb2dc766a930bae0; its only
change since fe2036c was the19-line checklist above. Main remains3e26d855. No
production service or database was queried or changed in this implementation.

The shared dependency-free `protocol.py` now contains the existing worker's
reserve/receipt/begin/lookup functions. Production wrappers inject the same
store, spawn callable and actual Modal identity. An executed AST comparison
against43ab6eb confirmed all four function bodies are identical after the
dependency/name substitutions. Existing runtime concurrency/crash tests remain
enabled. Source-location guards were updated to follow the extracted module;
new behavioral wrapper tests verify dependency wiring.

`providers/modal_motion/staging.py` provides an authenticated CPU-only ASGI app
using those exact functions and `PostgresReceiptStore`. It imports no Modal SDK,
GPU worker or model code. Its inline synthetic call is explicitly labeled and
never produces media or completes generation jobs. Separate staging settings,
canonical origin allowlisting/production denial, a fixture-only database marker
and prepared-job allowlist fail closed before admission. There is no production
credential fallback, HTTP fault control or ledger reset.

The staging database/event RPC lives in `scripts/test/sql/protocol2-staging-fixture.sql`,
outside production migrations. Append-only per-attempt UUID events count every
synthetic spawn/model start. A deliberate duplicate-event counterexample proves
counting cannot mask duplicate work. Legacy Dict app/probe remain clearly labeled;
legacy PASS now includes `protocol2_verified:false` (red regression reproduced
the previously missing label, exit1, then passed).

Verification, exact commands and changed files are in PROJECT_LOG.md:

- **421/421 Node and 78/78 Python**, zero skipped, exit0. Audit, TypeScript/Vite build,
  Python compilation and diff checks exit0; existing bundle warning remains.
- 20 independent CPU ASGI worker/client processes against actual PostgreSQL16
  produced one synthetic spawn and one fake model start. Six crash/lost-reply
  boundaries,100-year retention, conflicting fingerprints, forged ownership,
  unprepared jobs and role denial passed. Application jobs remain processing.
- Actual database outage failed closed before reservation. Stop/start and a full
  `pg_dump`/`pg_restore` into a second isolated database retained all eight fixture
  jobs and added zero attempts/starts on retry. One job deliberately retains a
  second model-start event as the negative oracle; it is not a healthy execution.
- Independent review found a raw-string production-origin denial bypass through
  uppercase hostnames/explicit443. The executed red test failed3variants; strict
  validated canonical-origin comparison fixed it and the regression passed.

The psql opener exercises real production JSON/auth headers, response validation
and service-role RPCs, not actual HTTPS/PostgREST. Local process IDs do not prove
Modal container identity. `after_receipt` interrupts the execution-side convenience
receipt write before fake model start; inline fake execution cannot prove
asynchronous provider/caller scheduling. Lost history and provider-boundary
atomicity remain unresolved; no exactly-once or completion claim is made.

Current classification: runner **IMPLEMENTED / LOCAL CPU TESTED**; deployment,
live PostgREST, real Modal two-container recovery, old-worker shutdown and staging
cost approval **NOT VERIFIED**. The earlier production-migration absence is a
historical read-only finding, not rechecked here. GPU/Android and production
remain NOT VERIFIED. See [runner guide](../../providers/modal_motion/STAGING_PROTOCOL2.md)
for setup and evidence limits. Next: review cost and isolated platform packaging,
then obtain authorization for actual authenticated staging transport/container
verification. Keep draft; no merge, deployment, real provider call or spending.

Published implementation: `19c71b0abfd54162475ffa6bc4fb1390844dde85`.
All four GitHub workflows passed on that exact commit, including the new CPU
probe/backup-restore step and full migration replay. Publication links and exact
command exits are recorded in PROJECT_LOG.md. This CI result does not establish
the outstanding staging/provider guarantees listed above.

## Modal CPU packaging and cost boundary — 2026-10-31

Continued from confirmed remotec0cb980358d5f4b17b6985d77d8460eb3b185aec;
main remains3e26d8556e62b40e9f20823cb253854ae5efcec6. The user's spending question
was not treated as approval. No cloud/account resource was queried or created.

`staging_modal.py` now defines a separate proxy-authenticated CPU App, with a
stage-environment guard, stage-scoped Secret and seven explicitly selected CPU
source files. GPU worker/test files and automatic source inclusion are excluded.
Requested/hard limits:0.125core and256MiB; max2containers,0warm/buffer, one input,
60-second input/startup timeouts and2-second idle scale-down configuration.
Runtime uses trusted `MODAL_TASK_ID`, dedicated bearer authentication and a
maximum10-minute absolute campaign deadline. New expired requests stop before
probe/database work; in-flight work and infrastructure billing are separate.

Real pinned Modal1.6.3 validation with every socket connection denied passed:
zero socket attempts and zero cloud invocations. It caught an invalid initial
`retries=0` declaration: Web Functions forbid the retries argument, including
zero. Removed the unsupported argument; no application retry loop was added.
Five new Python packaging tests and one real SQL identity/counting test pass.
Full local suites:422/422 Node,83/83 Python, zero skips. Audit, production
TypeScript/Vite build, compilation and complete diff checks passed. CI now also
executes the real-SDK offline verifier; its published-head result is recorded
separately in PROJECT_LOG.md.

Official public pricing matches the quoted CPU/memory rates. A nominal allocation
example is documented in the [guide](../../providers/modal_motion/STAGING_PROTOCOL2.md),
explicitly not a bill estimate/cap. No connected Modal billing tool is available.
Remaining credits, account eligibility, enforceable no-overage controls and
isolated cloud database costs remain NOT VERIFIED. The request deadline does
not stop deployment or prevent startup/idle/late-request charges. Approval alone
cannot establish a no-overage guarantee; require platform/account enforcement
and separate deploy/campaign/teardown authorization before any live operation.

Independent read-only review found no further concrete defect and confirmed the
cost limitation. Packaging is IMPLEMENTED / OFFLINE SDK TESTED; actual image
build, deployment, authenticated PostgREST, two-container behavior, old-worker
shutdown, GPU/Android and production remain NOT VERIFIED. No deployment, provider
invocation, paid operation, production change or merge was performed. Keep draft.
