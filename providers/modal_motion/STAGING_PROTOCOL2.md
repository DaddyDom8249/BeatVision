# CPU-only protocol-2 staging probe

Source and local verification only. This guide does not authorize infrastructure
deployment, remote database requests or Modal CPU/GPU spending. Confirm staging
costs and obtain explicit authorization before those actions. No GPU or model
dependency exists in this runner.

`staging.py` uses the same `protocol.py` functions as the production worker for
reserve, receipt lookup, execution begin and receipt persistence. Its only
execution implementation is inline synthetic CPU work. Receipts start with
`fc-staging-` and responses say `synthetic:true`. They are not Modal call IDs and
must never be supplied to the production controller or treated as output media.

The old `tests/staging_worker.py` and `verify_multiprocess_contention.py` use Dict
and remain **legacy only**. Their PASS output now explicitly reports
`protocol:legacy_dict,protocol2_verified:false`.

## Isolated local database verification

Use a fresh local PostgreSQL16 container with no exposed ports and no external
network. The following file order is required; none is a production operation:

1. `scripts/test/sql/generation-enqueue-fixture.sql` (minimal synthetic schema).
2. `supabase/migrations/20261030204115_durable_modal_admission.sql`.
3. `scripts/test/sql/protocol2-staging-fixture.sql` (staging-only sentinel,
   prepared-job allowlist and append-only event RPC; outside migration directory).
4. Insert exactly one random UUID into `private.protocol2_staging_environment`.

Then run the independent CPU process driver against that explicit container:

```sh
BEATVISION_PROTOCOL2_TEST_ISOLATED=1 python -B scripts/test/verify_protocol2_staging.py \
  --psql '["docker","--host=unix:///var/run/docker.sock","exec","-i","YOUR_ISOLATED_CONTAINER","psql","-U","postgres","-d","postgres"]'
```

This driver inserts synthetic fixture jobs10021–10028 and their allowlist entries
only after checking readiness. It must not run against an application database.
It never edits source approvals or resets admissions. A second first-run attempt
on the same fixture fails instead of clearing history. Use a fresh database for
a new campaign.

The driver exercises20 independent ASGI client/worker processes and verifies one
synthetic spawn/start, six process-death/lost-reply boundaries, fingerprints,
ownership, unprepared jobs, role denial and100-year retained claims. Its negative
oracle deliberately appends a second `model_start` event for job10028 to prove
the event table cannot conceal duplicates. That job is an intentionally failing
counterexample, not a healthy one-start execution.

Stop the owned database and run the same command with `--expect-unavailable`.
Restart it and use `--verify-existing`: all eight jobs must add zero events.
An isolated full `pg_dump`/`pg_restore` into a second local database can be checked
with `--verify-existing` against that database. Never restore over production.
Only a backup retaining every relevant claim supports this containment property;
stale snapshots or lost ledger history do not.

The test transport uses production `PostgresReceiptStore` JSON/authentication and
reply validation with an injected psql opener executing real service-role RPCs.
It does **not** establish live HTTPS/PostgREST behavior. All test endpoints and
events are local; local process identities do not prove Modal container identity.

## Future authorized isolated staging configuration

Use a dedicated non-production database with the reviewed application migrations
and stage-only fixture RPC installed. Do not install the minimal local schema on
an existing application database. An operator must prepare synthetic authorized
jobs with exact frozen dispatch payloads and approved fixture sources, and add
only those UUIDs to `private.protocol2_staging_jobs`. The serving application
cannot create jobs, approve media, clear reservations or append arbitrary events
from HTTP request fields.

Supply these server-only settings through the authorized secret mechanism:

- `BEATVISION_PROTOCOL2_STAGING=ISOLATED_CPU_ONLY`.
- `BEATVISION_STAGING_SUPABASE_URL` and `BEATVISION_STAGING_EXPECTED_ORIGIN`:
  the reviewed HTTPS origin under `*.supabase.co`.
- `BEATVISION_PRODUCTION_SUPABASE_URL`: independently verified production origin
  to deny. Hostname case, explicit443 and trailing slash cannot evade comparison.
- `BEATVISION_STAGING_SERVICE_ROLE_KEY`: staging credential only.
- `BEATVISION_STAGING_RUN_ID`: the isolated database sentinel UUID.
- `BEATVISION_STAGING_PROBE_TOKEN`: dedicated random bearer token, at least32
  characters. Do not reuse a production credential or put it in command history.

There is no fallback to `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY`. The declared
origin denial and database marker are guards, not independent proof that an
operator selected a non-production database. Verify actual project identity
separately before any request. Missing/mismatched marker or unavailable database
fails before admission. HTTPS redirects are rejected; errors omit credentials.

For an authorized local ASGI server with those settings already injected:

```sh
python -m uvicorn providers.modal_motion.staging:application --factory --host 127.0.0.1 --port 8765
```

Use Python3.11+ and the repository's verified FastAPI/httpx setup; serving needs
the uvicorn extra (`fastapi[standard]`). No server was started against a remote
database in this work. Bind to loopback; a future container/proxy deployment
requires a separate reviewed configuration and cost authorization.

Every HTTP route requires `Authorization: Bearer <staging probe token>`.
`POST /submit` accepts exactly `payload`, `image_base64` and `ack`, where ack is
`I_AUTHORIZE_ISOLATED_CPU_FAKE_EXECUTION_ONLY`. The payload/image must match a
prepared job. `GET /verify/{job_uuid}` returns synthetic receipt state and event
counts, never retained prompts, fingerprints or admission tokens. There are no
HTTP crash controls or ledger-reset endpoints.

## Interpretation of interruption tests

`after_reserve` and `after_begin` terminate after SQL commit but before the reply.
`after_acceptance` terminates after a recorded synthetic spawn attempt but before
execution begin. `after_receipt` terminates at the execution-side convenience
receipt write before fake model start; it does not model a separate asynchronous
provider's caller-side receipt write. `after_model_start` retains a start event
without completion. `lost_submit_reply` ends after HTTP handling completed.

Each event has a fresh UUID and a fresh synthetic call ID per spawn attempt;
there is no per-job UPSERT masking duplicate attempts. Event persistence and a
side effect are separate operations: missing events are not unconditional proof
that no external work happened. The synthetic body produces no image/video and
never marks generation jobs complete.

Status: runner IMPLEMENTED; exact executed local checks are in PROJECT_LOG.md.
Actual PostgREST, Modal CPU deployment, two-container recovery, old-worker
shutdown, staging cost approval, GPU output and production remain NOT VERIFIED.
Keep PR #164 draft. The reservation-to-provider gap still cannot guarantee
exactly-once execution or eventual completion.

## Separate Modal CPU package (offline verified, not deployed)

`providers/modal_motion/staging_modal.py` packages the existing ASGI runner as
the distinct App `bragoraforge-protocol2-cpu-probe`. The pinned operator setup is
`providers/modal_motion/requirements-staging.txt` (Modal1.6.3, FastAPI0.162.0).
Installing the SDK is not a deployment. The real SDK definition is checked by
`scripts/test/verify_modal_package_offline.py` with every socket connect denied;
it never runs/deploys a Function or builds an image remotely.

The image includes exactly seven explicitly selected CPU source files, including
both package initializers. Automatic source inclusion is disabled. GPU worker,
legacy tests, models and production secrets are excluded from this image.

| Configuration | Value |
| --- | --- |
| CPU request and hard limit |0.125core each |
| Memory request and hard limit |256MiB each |
| Maximum concurrent containers |2 |
| Warm/buffer containers |0 /0 |
| Inputs per container |1 |
| Input/startup timeout |60seconds each |
| Idle scale-down configuration |2seconds |
| Proxy authentication |Required, in addition to probe bearer token |
| Modal resource access from runner |Restricted |

Modal1.6.3 forbids configuring `retries` for Web Functions, including zero. The
initial actual-SDK check caught that error; the unsupported argument was removed.
There is no application retry loop. Duplicate HTTP inputs still consult the
shared permanent ledger. Provider enforcement and image startup remain untested.

The CLI must select the dedicated environment `bragoraforge-protocol2-staging`;
the local definition rejects default/production environments before referencing
resources. The named Secret `bragoraforge-protocol2-staging` is pinned to that
environment and requires all existing staging settings plus
`BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT`: a timezone-aware ISO8601 timestamp no
more than ten minutes ahead at container startup. Missing/expired/unbounded
windows fail before database setup. Authenticated new requests after the captured
deadline receive410 before probe/database access; unauthorized requests stay401.

The wrapper requires actual runtime `MODAL_TASK_ID` in `ta-*` form and records
`modal-ta-*` as worker identity. It never accepts identity from a request. The
staging-only event fixture now allows both local and Modal labels. Unit tests use
clearly synthetic task IDs; this does not prove an actual Modal container ran.
Existing inline fake execution still produces synthetic receipts, not provider
call IDs, and no media.

Only after all approval/budget/database conditions below are independently
satisfied, the reviewed deployment command would be:

```sh
python -m modal deploy --env bragoraforge-protocol2-staging -m providers.modal_motion.staging_modal
```

This command has **not been executed**. It can create resources/build images and
consume credits. A dedicated proxy credential/token, exact staging API origin,
prepared isolated jobs and verified shutdown/teardown procedure are required for
a future bounded campaign. A20-request success must also show at least two
different trusted `modal-ta-*` identities; max_containers2 alone does not prove
two containers actually handled work. Do not use the legacy Dict probe client as
protocol2 acceptance evidence.

## Spending decision remains blocked

No live-test approval has been inferred from the user's cost-review question.
Only the owner can authorize consumption of account credits. No account-specific
remaining balance, payment eligibility, enforceable no-overage setting or
isolated cloud database budget was verified here; there is no connected Modal
billing tool in this session. Missing evidence is not treated as available credit.

[Official Modal pricing](https://modal.com/pricing), fetched during this work,
lists CPU at$0.0000131/core-second and memory at$0.00000222/GiB-second. These rates
do not establish a free test. At those rates, a hypothetical two containers each
allocated0.125core/0.25GiB for600seconds computes to$0.002631. This is an arithmetic
example, **not a bill estimate or upper bound**: startup/image builds, platform
metering, idle time, additional requests and other charges are not established.
Included monthly credits do not prove the current account has credits remaining.

The application deadline does not stop the Modal App or cap spending. A
proxy-authenticated request after expiry may still allocate/start a billed
container before receiving410 or failing startup; in-flight work can continue.
Verify a provider/account hard no-overage gate and separate deploy/campaign/
teardown authorization before any live action. If an enforceable no-overage gate
cannot be established, do not run this test under the current zero-cost rule.

Current status: packaging IMPLEMENTED / OFFLINE SDK TESTED. Deployment, actual
PostgREST, two-container recovery, account eligibility, old-worker shutdown,
GPU/Android and production remain NOT VERIFIED. No cloud resource was created.
