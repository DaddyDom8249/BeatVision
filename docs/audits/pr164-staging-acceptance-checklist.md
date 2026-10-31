# Protocol-2 staging acceptance checklist

**Current decision: BLOCKED. No live execution is authorized.** This is a plan
and evidence specification, not permission to deploy, launch containers, submit
requests or consume credits. Baseline inspected:
`f90b2670efb01f90e8705dfa1ac2894c09da6b5b`. Reconfirm the actual candidate SHA
before any future campaign. Keep PR #164 draft and main unchanged.

Use [the evidence template](pr164-staging-evidence-template.json). Every case
starts `NOT_RUN`. A populated template or a true/false flag cannot grant approval
or independently prove provider/account behavior. Record evidence references,
exact commands, exit codes, timestamps and an independent reviewer.

## 1. Reproduce the offline checkpoint

Run from the repository root with the verified Node22/Python3.11+ environments.
Use the already-installed pinned SDK for its check; no Modal CLI command is run.

```sh
git rev-parse HEAD
git status --porcelain
git diff --check
python -B -m unittest discover -s providers/modal_motion/tests -v
node scripts/run-tests.mjs
node scripts/production-audit.mjs
npm run build
python -B scripts/test/verify_modal_package_offline.py
```

The last command requires Modal1.6.3 from `requirements-staging.txt`. It blocks
socket connections, declares the package locally and does not build an image or
invoke a Function. Record actual totals and exits rather than copying a prior
run. A clean source tree and passing checks establish an offline checkpoint,
not staging readiness. Do not provision a database/container as part of this
offline checklist step.

Review [the guide](../../providers/modal_motion/STAGING_PROTOCOL2.md) against
`staging_modal.py`, `staging.py`, `protocol.py`, `admission.py`, both admission
SQL files and the pinned operator requirements. Expected package: selected seven
CPU files; no GPU worker/models; proxy and bearer auth; staging-only settings;
0.125core/256MiB request and hard limits; max2containers;0warm/buffer; one input;
60-second input/startup timeouts; no application retry loop; fixed deadline at
most600seconds ahead; actual runtime task identity. Verify these from the exact
candidate, not from a prose claim.

## 2. Hard-stop gates before any live action

All gates require independent evidence. Unknown, stale or missing evidence is
BLOCKED. None is satisfied merely by CI or this document.

| Gate | Required evidence |
| --- | --- |
| Explicit authority | Owner authorization references the exact SHA, separate deploy/campaign/teardown actions, permitted credits, request ceiling and deadline. No approval is currently recorded. |
| Account/workspace | Correct Modal account/workspace identity, current remaining credits and enforceable provider/account no-overage behavior. Published rates, monthly allowances, alerts, CPU limits and TTL are insufficient. If a hard no-overage gate is unavailable, stop. |
| Database eligibility | Dedicated non-production project identity, cost eligibility, actual schema/migration versions, private ledger retention and tested consistent backup restoration. Declared URL and sentinel alone are insufficient. |
| Isolation | Production schedulers, cron jobs, webhooks, callbacks and provider routes cannot consume fixture jobs. Do not copy production secrets/config wholesale. No GPU worker is deployed by this plan. |
| Old execution paths | Independent inventory of deployed controllers, HTTP/GPU workers, legacy Dict apps and operator CLIs; verified shutdown/revocation and rollback plan. A newly packaged app does not disable old binaries. |
| Fixture authority | Synthetic source approved explicitly in the isolated environment; correct projects.owner_id, exact frozen payload/image hash/provenance and prepared-job allowlist. No production assets or automatic approval edits. |
| Package/runtime | Exact source/image digest, SDK/runtime versions, requested/provider-observed limits, dedicated environment/Secret and narrowly scoped proxy credentials. Never log secret values or headers. |
| Campaign tooling | Reviewed protocol2 HTTP client and deterministic external fault method, exact request cap, no automatic POST retry, exact HTTPS origin, redirects blocked, redacted evidence and teardown owner. See the tooling gap below. |

This plan grants no authority to stop or modify production workers. Any required
production shutdown has its own approval and remains a release gate; an isolated
staging authorization does not grant production cutover or shutdown permission.
Leave a gate blocked rather than changing production to fill the template.

## 3. Freeze a bounded campaign manifest

Before deployment, fill the template's source SHA, source/image digests,
environment, database sentinel, fixture UUIDs, payload/image/snapshot hashes,
approved origin, deadline, maximum POST/GET/control operations and evidence
references. Do not put credentials, admission tokens, retained prompts or raw
request/response headers in the manifest. Use secret-store references separately.

Select the intended case IDs and calculate an aggregate request ceiling; the
healthy contention case alone needs20POSTs and at most2verification GETs. Do not
run every row under an approval covering only that20-request case. Changes to
code, fixture identity, deadline, selected cases or limits require a reviewed
manifest and the corresponding authority; never improvise more requests.

Deployment instructions remain in the guide behind the gates. They have not
been executed. Proxy authentication and the separate probe bearer are both
required. Never send synthetic receipts to the production generation controller.

## 4. Acceptance cases and explicit oracles

Every live row is currently NOT_RUN. Each fixture job has a stable UUID and exact
prepared payload. Counter values come from independent isolated DB evidence,
not HTTP status counts. Do not reset/delete reservations between attempts.

| ID | Procedure within its approved cap | Required evidence / abort condition |
| --- | --- | --- |
| AUTH | Missing/wrong proxy credential and missing/wrong probe bearer | Rejected before probe DB/admission work. No secret echo, no events. Provider/auth failures are distinguished from application401. |
| HEALTHY |20independent clients submit the same prepared job; then at most2GETs | Replies identify protocol2, synthetic receipts, expected run/job and at least2distinct trusted `modal-ta-*` identities corroborated by provider metadata. One reservation, one execution fence, one spawn/start/completion; one stable synthetic receipt. One container or all-unknown receipts cannot pass. |
| RETRY | Bounded retries of that same job, including a fresh client process | Same receipt/claim, no additional spawn/model events, no application-job completion. |
| LOST_REPLY | Reviewed client fault discards a reply after dispatch; bounded reconciliation and retry use the same UUID | Independently establish whether admission/receipt committed. Unknown acceptance remains held; no replacement request or invented receipt. Client timeout alone is insufficient fault evidence. |
| CONFLICT | One changed fingerprint and one unauthorized ownership/source context, separately prepared negative cases | Rejected/held; no new spawn/start or mutation of frozen input, approval, known receipt or provenance. |
| RESERVE_CRASH | Deterministically end the isolated caller after reservation commit and before fake execution | Durable unknown hold; a fresh worker adds zero submissions. Record exact boundary evidence. |
| BEGIN_CRASH | End the isolated worker after begin commit but before acknowledgment/fake body | Fence/receipt survives; same-call and competing reentry denied. Missing start events alone do not prove no external work. |
| RECEIPT_CRASH | End after the execution-side convenience receipt commit | Retained receipt/fence, no second model start. Do not relabel this as asynchronous provider/caller recovery. |
| DB_FAILURE | Reviewed isolated DB transport/write-refusal fault, not a client-to-API outage | Fail closed before a new grant/start. Known state retained; no terminal failure or automatic POST fallback. |
| RESTART_RESTORE | Approved worker restart and consistent isolated DB backup/restore | Same UUID, request fingerprint, receipt and fence; zero added starts. Stale backups/lost ledger history cannot establish containment. |
| EXPIRY | Prove an existing warm instance at its captured deadline, then bounded GET/POST; separately exercise an expired cold start | Warm app:410for authenticated new requests,401for bad/missing bearer, zero additional probe DB work; body/header/environment refresh cannot renew it. Cold start: initialization refuses the expired window before DB setup; platform HTTP status is NOT VERIFIED until actually observed, not assumed410/401. Neither result proves billing stopped. |
| LEGACY_HOLD | Explicitly prepared legacy/unknown-acceptance fixture | Non-reclaimable hold/known receipt retained; zero new fake inference and no reset to queued. |
| NEGATIVE_ORACLE | Separate marked counterexample appends duplicate synthetic events in the isolated evidence fixture | Both starts are counted and classified FAIL for that counterexample. Never include it among healthy one-start successes. |

The current runner executes inline synthetic CPU work. It does not model a
separate asynchronous provider, create media or complete generation jobs.
Provider atomicity and eventual completion cannot be inferred from these cases.

For EXPIRY, do not assume a previously used instance is still warm: the package
has min_containers0 and a2-second idle scale-down setting. Declare and review the
bounded method for reaching the warm deadline within the request/budget cap.
If that cannot be established, leave warm expiry NOT VERIFIED; do not send an
unbounded keep-alive loop. Record warm/cold observations separately in the template.

## 5. Current tooling gap: stop before a live fault campaign

The repository's `verify_protocol2_staging.py` is an isolated psql/ASGI process
driver, not a live HTTP campaign client. The old
`verify_multiprocess_contention.py` targets the legacy Dict protocol and is
explicitly unsuitable. The deployed CPU package exposes no crash/reset endpoints.

A complete reviewed protocol2 live client and deterministic external live crash
controller are not yet implemented. Prepare/test those offline, with bounded
requests and mocked transports, before scheduling the corresponding live rows.
Do not improvise repeated curl calls, weaken auth, add public fault flags or
claim local os._exit/PID evidence proves real Modal container recovery.

## 6. Preserve evidence, reconcile, then tear down

Collect before/after event counts, receipt identity (redacted/digest), fence state,
source snapshot hashes and application-job state independently from the isolated
database. Avoid SELECT*; never export admission tokens or normalized prompts.
After HTTP expiry, use an already-authorized read-only database path for evidence;
do not renew the app deadline or create another inference to obtain a GET result.

Any unknown receipt, conflict, unexpected start, source drift, missing identity,
budget uncertainty or cap exhaustion stops the campaign. Preserve claims and
raw redacted evidence; reconcile existing work only. No automatic replacement.

Use the separately authorized teardown plan to stop the actual staged App,
revoke campaign credentials and verify provider-observed termination/billing
state. HTTP410, an idle container, client exit or TTL is not teardown evidence.
Retain the isolated ledger and consistent backup. No production cutover/merge or
GPU test follows automatically; each retains its existing independent gates.

Final review records IMPLEMENTED, OFFLINE TESTED, STAGING VERIFIED, BLOCKED and
NOT VERIFIED separately. Keep the live result BLOCKED until actual evidence and
authority exist. The task that prepared this checklist performed no live steps.
