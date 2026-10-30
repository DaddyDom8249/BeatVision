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
