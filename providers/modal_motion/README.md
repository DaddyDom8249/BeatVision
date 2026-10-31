# Permanent admission protocol 2

For the shared CPU-only probe and its explicit local/staging evidence limits,
see [STAGING_PROTOCOL2.md](STAGING_PROTOCOL2.md). The old Dict harness is legacy-only.

This worker remains gated research, not a production deployment. Import, compile,
unit tests and CLI dry-run do not invoke inference. Do not run a real provider
call, deploy, or assume free GPU/container compute from this guide.

## Authority and permissions

`private.modal_motion_admissions` is the non-expiring authority for submission
and model entry. It retains each generation-job UUID, owner/project/scene/source,
normalized request, fingerprint, random admission token, receipt and execution
fence. It has no TTL or cascading project/job foreign key. Project deletion does
not recreate permission for an old UUID. Records include the normalized prompt
as durable execution evidence, but no image bytes, signed URLs or credentials.
Do not purge this ledger when clearing caches or deleting creative data.

Only the service-role RPC `public.modal_motion_admission` can mutate these rows.
Anon/authenticated roles cannot call it; service_role has no direct table writes.
`reserve` grants only a first insert. Existing rows and same-token retries never
grant another submission. `begin` grants model entry once, before torch/model
loading, rejecting every repeat including the same provider call. `receipt`
accepts an identical call ID idempotently without clearing the execution fence.
Conflicting/replayed receipts fail closed. There is no reset/reclaim operation.

Both CLI and HTTP use `_reserve_motion` and the same PostgreSQL client. The GPU
function independently consults that ledger using its actual call ID and winning
admission token. Modal Dict and process-local caches cannot grant permission.
Malformed replies, refused writes, timeouts, redirects and missing configuration
stop admission; no automatic provider request is retried.

## Configuration for a future authorized staging rollout

Apply `supabase/migrations/20261030204115_durable_modal_admission.sql` in an
isolated environment first. It seeds permanent legacy holds for existing Modal
jobs, including queued jobs. Any later old-protocol job is also held. Absence of
an old Dict entry is never evidence that inference did not start.

The named server-only Modal Secret `bragoraforge-motion-ledger` must supply:

- `SUPABASE_URL`: the exact HTTPS project origin under `*.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY`: a server-only credential with permission for the
  service RPC. Never put it in browser config, source, command history or output.

Both web and GPU functions bind this named secret. The CLI additionally needs
the same server configuration locally through the authorized secret mechanism.
No credentials are created or configured by repository tests. A missing secret,
RPC or schema is a hard stop, not permission to use Dict instead.

New jobs carry immutable `modal_motion.admission_protocol:2`; the controller
records their exact authorized dispatch payload and source hash before POST.
The payload includes `admission_protocol:2` inside the object parsed by
`MotionRequest`, so old workers reject it before model loading. New workers reject
old payloads. The public adapter refuses legacy payloads before sending a request.

Freeze admission and disable/drain/revoke every old deployed worker/CLI path
before enabling new execution. A new database cannot constrain an old running
binary that never consults it. Check that the controller, HTTP worker, private
function and operator CLI all use the verified revision and the same ledger.
Do not infer a safe cutover from CI or deploy them automatically.

## CLI contract and recovery

Dry-run remains local and accepts synthetic IDs for validation. Execute now
requires a real authorized generation job, approved source and exact prepared
dispatch payload; arbitrary standalone proof UUIDs cannot authorize inference.
Existing source/ownership checks, spending acknowledgement and explicit execute
flag still apply. This restriction is intentional and must be communicated to
operators rather than bypassed with hand-written job rows or approval edits.

An unknown acceptance stays held indefinitely. A worker that starts later can
publish its actual receipt before loading the model. A process dying before
provider start may strand a claim that produced no inference; that does not
justify another submission. Use the owner-safe reconciliation pathway described
in `docs/audits/pr164-lifecycle-repair-20261030.md` for verifiable existing output.
Legacy cache-only receipts require controlled operator reconciliation while
evidence remains available. Never invent a receipt, clear a hold, or reset a job
to queued. Known database receipts are retained by the migration.

## Evidence and limits

`scripts/test/modal-admission-ledger.db.test.mjs` runs isolated SQL permission,
legacy-hold, identity, receipt, one-shot claim and restart checks. The explicit
isolated runner `scripts/test/verify_modal_admission.py` runs real CLI/HTTP code
in independent processes against PostgreSQL using simulated provider calls. Its
fixture acknowledgement is mandatory. The generation-security CI runs it after
applying the migration. The older Modal Dict contention probe does not validate
this new protocol and must not be used as evidence for its durability.

This provides tested durable at-most-once admission/model entry under a retained
authoritative ledger and controlled protocol-2 cutover. It does not make a remote
provider operation and a PostgreSQL transaction atomic, guarantee completion,
survive deliberate ledger deletion/rollback to lost history, or constrain raw
administrator SDK calls to old code. GPU container allocation occurs before an
in-function model gate; tests establish no paid-compute guarantee for arbitrary
raw SDK invocation. Real Modal cross-container behavior, rollout, GPU render and
Android playback remain NOT VERIFIED. No exactly-once execution claim is made.
