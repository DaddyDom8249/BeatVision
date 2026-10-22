# BragoraForge sponsor demo execution checklist

Mission opened 2026-10-22 UTC. This is the authoritative checklist for this mission.
Only one item may be IN_PROGRESS. This file does not itself authorize creative
approval, production changes or unknown-cost inference. The user subsequently
authorized the reviewed production release with “Do it”; that release is below.

Evidence classes: CONFIRMED = direct observation; PROBABLE = inference;
UNKNOWN = insufficient evidence; BLOCKED = identified dependency.
PASS requires the acceptance criteria below; source or CI alone cannot establish
a sponsor journey PASS. Previous agent/PR narrative is context, not fresh proof.

## Implementation identities

- Repository: https://github.com/DaddyDom8249/BeatVision (public, not archived).
- Main: `3e26d8556e62b40e9f20823cb253854ae5efcec6` (git ls-remote).
- Candidate baseline: `74f0367f2f3584669d7b91cde6b5111b470c71bc`.
- Existing draft PR: https://github.com/DaddyDom8249/BeatVision/pull/141;
  head `repair/song-intelligence-integrity-20261021`, base
  `feat/modal-ltx-motion-proof-20261019` at
  `7fb7649ad517db558acc445ec0fa478558ed359d`.
- Mission branch: `repair/sponsor-demo-verification-20261022`, based on PR #141.
- Mission commits: checklist `9140561a38ab00d3c297cdfc9005c2301358af86`;
  Modal transport `fbbcb3d5697f39dcdfd95e32ca77ce58dc46349b`;
  estimate labels `b8baeaad49508577310044d51fb4bd31134606af`.
- Review/evidence head pushed to existing draft PR #141:
  `cf2ccb34a2589fe934193aa1f8c2eb145d273332`.
- Current production: https://beat-vision-theta.vercel.app/; Vercel
  `dpl_HBVecpyByZ6czJvLHvuHwWajis2W`, READY, exact frontend commit
  `63604806744e6d306742c75d399cc001c00aa0e4`.
- Initial production (historical evidence): `dpl_FgoTWCHFi8WZnAgwbQP8RzQzpCkT`,
  `4a2ebf8bf3e9f30f0cf35442f86662bb6296da86`.
- Current backend: production migration bundle `20261022170451`; analyze-song v41,
  interpretation v2, AI Director v1, World v60, Style v28, generation v61.
  Generation v61 deliberately retains the existing controller with the repaired
  Modal module; the full candidate Arena controller is configuration-blocked.
- Supabase `mdofsinyofqbeapzfygu`: ACTIVE_HEALTHY, PostgreSQL 17.6.1.127.
- Modal application name supplied: `bragoraforge-modal-motion-proof`;
  current provider availability/billing not yet independently verified.

## Task index

ID| Task| Dependency| Status| Evidence
---|---|---|---|---
T01| Verify current repository, deployments, and integrations| None| PASS| CONFIRMED identities, schema/function gaps and candidate CI: evidence/sponsor-demo-20261022/baseline.json
T02| Verify sponsor registration and login| T01| PASS| signup-result.json, login-result.json: actual confirmed fresh account; desktop/Pixel 7 sign-in HTTP 200 and settled empty dashboard
T03| Verify project creation and song upload| T02| PASS| Initial create/upload/reload PASS; current 254.48-second audio read-only playback/hash verified on desktop/Pixel 7 after source change
T04| Verify music analysis and interpretation confirmation| T03| BLOCKED| Phone post-patch CORS PASS; management read not executed; final known-path CLI batche8641d25 awaits required phone approval (attempt3/3)
T05| Verify World Reveal, editing, and approval| T04| BLOCKED| T04; deployed World GET/gate verified; no artist-confirmed interpretation or World approval
T06| Verify Style Bible, characters, environments, and approvals| T05| BLOCKED| T05; explicit sponsor creative approvals required
T07| Verify story, storyboard, and approval| T06| BLOCKED| T06
T08| Verify real scene-image generation and approval| T07| BLOCKED| T07; no approved isolated sponsor scene
T09| Verify Modal configuration, authentication, and GPU spending safeguards| T01| BLOCKED| Corrected phone check completed exit0: app deployed, no backlog/running inputs, billed$0.00; GPU/model runtime and approved scene unverified; modal-control-plane-verified.json
T10| Verify short real AI-motion generation from an approved scene| T08, T09| BLOCKED| No approved sponsor scene; T09 worker/account access and remaining financial/execution prerequisites unresolved; $0 spend-limit screenshot now verified
T11| Verify generated MP4 integrity, visible subject motion, and frontend playback| T10| BLOCKED| No T10 output; neither codec nor subject-motion/playback proof exists for this mission
T12| Verify clear full-length GPU sponsorship stopping point| T11| BLOCKED| No verified short proof or observed resource exhaustion; do not fabricate a funding stop
T13| Run complete sponsor-journey regression testing| T02–T12| BLOCKED| Intake and partial local DSP tested; T04–T12 prevent sequential journey
T14| Deliver verified sponsor demo URL, evidence, and remaining funding requirements| T13| BLOCKED| Production/immutable URLs, PR and evidence delivered; fully verified sponsor demo and motion proof blocked by T04–T13

## Task records

Initial observations below are historical. The resumed-release records at the
end supersede the initial deployment/schema blockers; current statuses are in
the index. No previously observed failure is erased.

### TASK ID: T01
Objective / acceptance: Identify exact repository/PR/deployment versions and
available integration access; distinguish live backend from candidate source.
Initial status: UNKNOWN.
Evidence inspected: GitHub get_repo/fetch_pr; git ls-remote and clone; Vercel
get_deployment/list_deployments; Supabase get_project/list_migrations/
list_edge_functions on 2026-10-22; root AGENTS.md; Modal README.
Confirmed blocker: Candidate Song Intelligence migrations are absent from
production migration history; no beatvision-song-interpretation Edge Function
is listed. Production and candidate frontend commits differ.
Files changed: docs/SPONSOR_DEMO_TODO.md (created before any source modification).
Commit: Checklist `9140561a38ab00d3c297cdfc9005c2301358af86`; backend and frontend
identities in baseline.json; source changes listed above.
Tests performed: Read-only identity/access checks succeeded. Runtime environment
connected, no secret/outbound identity bindings; connected Supabase/Vercel tools
are separately functional. Local Chromium and ffprobe are available.
Verification: PASS for inventory/access acceptance, not provider inference.
Next task: T02.

CONFIRMED: read-only information_schema query returned no candidate fingerprint,
style or interpretation columns/tables from the requested set. Migration
history ends at `20261017173823`; candidate 20261020/20261022 migrations absent.
Exact candidate preview `dpl_FEQcNf99b6AZbAJwDSWqhEiW5mAj` is READY at
https://beat-vision-f8nn-qnbsh8jx1-beat-vision.vercel.app/.
GitHub exact-baseline runs `39720271599` (Production CI), `39720271675`
(PostgreSQL scoped replay), `39720271612` (Modal offline) report completed/success.
These are retrieved CI results, not fresh authenticated journey evidence.

### TASK ID: T02
Objective / acceptance: A fresh authorized test sponsor can register, confirm
email when required, log in, and reach the dashboard in desktop and Android
browser contexts; no owner-account substitution for this acceptance.
Initial status: TODO.
Evidence inspected: evidence/sponsor-demo-20261022/auth-inspection.json and
auth-desktop.png / auth-android-emulated.png; actual production frontend at
the production deployment identity above, local /usr/bin/chromium via Playwright.
Public Auth settings GET returned HTTP 200, signup enabled, email enabled,
mailer_autoconfirm=false. No signup submission or login was attempted.
Confirmed blocker: Initial missing mailbox resolved by user-supplied test email
and user-completed confirmation. Existing owner vault account was not used.
Files changed: None.
Commit: Candidate/production identities above; no task source changes.
Tests performed: Real sign-in page HTTP 200 in 1440px desktop and Pixel 7 browser
emulation; registration toggle and email/submit visibility observed; no page
errors or horizontal overflow. This does not prove signup, login or physical
Android behavior.
Verification: PASS (final; signup, user confirmation and settled logins below).
Next task: T03.

Update: user supplied a controlled mailbox. Read-only auth.users existence check
was false before signup. One real frontend signup returned HTTP 200 with no
session and the UI's confirmation-email message (signup-result.json). Random
test password stored mode 0600 outside the repository; never logged or committed.
User asked to click email confirmation link. No confirmation bypass, password
reset, duplicate signup, or owner project changes.

Final T02 verification: PASS. User confirmed email; read-only auth.users boolean
confirmed email_confirmed_at is populated. Real sign-in POST returned HTTP 200
on desktop and Pixel 7 emulation. Both reached a fully settled dashboard with
zero projects and no page errors/horizontal overflow (login-result.json and
dashboard-settled screenshots). Initial loading-only observations are retained
in login-initial-observation.json and are not counted as success. No physical
Android device test performed. Production commit remains `4a2ebf8…`; candidate
auth files are unchanged relative to production. Next task: T03.

### TASK ID: T03
Objective / acceptance: Fresh sponsor creates an isolated project, uploads an
actual audio file, saves and reloads it with authorized private playback and
correct duration; desktop and Android layout remain usable.
Initial status: TODO.
Evidence inspected: intake-result.json, audio-fixture.json, real desktop/Pixel 7
screenshots and persisted private audio playback.
Confirmed blocker: None for the isolated real-audio fixture.
Files changed: None.
Commit: Baseline identities above.
Tests performed: Real frontend create/upload/save/reload/play, results below.
Verification: PASS for isolated intake fixture.
Next task: T04.

Final T03 verification: PASS for appropriately isolated intake fixture, not a
commercial-song/long-upload acceptance claim. Real production frontend created
project `a4841264-fac6-4ec9-ae07-04544493257c` (HTTP 201) and saved its real WAV
upload/song (HTTP 201). Browser reload retained title, artist and private audio.
Actual audio currentTime advanced >0.25 s, paused=false, error=null, duration=16
on desktop and Pixel 7 emulation; no horizontal overflow. See intake-result.json,
audio-fixture.json (705644 bytes and SHA-256), song screenshots. No source changes
for T03. Test audio is locally composed instrumentation, not customer material.
No preexisting records/assets were modified or deleted. Production commit above.
Next task: T04.

Input-change revalidation: a later session changed this project's audio to a
254.48-second, 5,649,423-byte track. Actor/cause UNKNOWN; no replacement or
transcription was submitted by this agent after the deliberately blocked test.
Read-only current-audio-revalidation.json confirms HTTP 200, matching SHA-256
`2546e9caca999e16180b0196f61f57feb76dfb340db0e94d1d6f8efbd13e8343`,
finite duration, advancing playback/error=null on desktop and Pixel 7 emulation.
The new content is preserved. Transcript-bearing candidate screenshots are
private in /workspace/shared/private-sponsor-evidence/ and will not be published
in the public repository; sanitized DOM results are included instead.

### TASK ID: T04
Objective / acceptance: Real uploaded audio produces persisted signal-derived
analysis, clearly labeled interpretation, and explicit sponsor confirmation;
no heuristic presented as fact or approval gate bypassed.
Initial status: TODO.
Evidence inspected: Baseline schema/function inventory; deployed analyze-song
v39 source; local-dsp-result.json; candidate-gate-and-estimates.json; fixture
analysis metadata via read-only SQL; SPONSOR_DEMO_RELEASE_GATES.md.
Confirmed blocker: Production interpretation tables/columns and functions absent;
coordinated release authorization and provider free-account proof required.
Files changed: src/pages/SongPage.tsx (estimate labels); checklist, release packet
and task evidence files.
Commit: `b8baeaad49508577310044d51fb4bd31134606af`.
Tests performed: Actual frontend local DSP under explicit transcription-network
blocking; related song/auth regressions 34/34 PASS; build PASS; desktop/Pixel 7
local candidate estimate and interpretation-boundary checks PASS.
Verification: BLOCKED for complete analysis/interpretation confirmation.
Next task: T09 (independent).

#### T04.1 — Label musical estimates honestly

CONFIRMED defect: real production and candidate pages display DSP guesses under
unqualified BPM/Musical Key labels and say structural regions were detected.
local-dsp-result.json and candidate-schema-result.json show 117.5 BPM, C major
and 4 regions; persisted metadata identifies autocorrelation/key-profile and
energy_change_heuristic, not verified musical ground truth.
Root cause: SongPage renders estimated fields without identifying uncertainty.
Required file: src/pages/SongPage.tsx. Expected outcome: tempo/key and structural
candidates are explicitly labeled as estimates and heuristics. Verification:
real local-built frontend on the existing isolated test project, desktop and
Pixel 7 emulation; existing regression suite/build. No new UI feature or provider
request. Initial schema inspection's test script incorrectly expected a disabled
Continue button; source and observed page show it is absent. Correct this test
expectation, preserve the initial failed inspection, and do not change that gate.

T04.1 verification: PASS in local build, source commit
`b8baeaad49508577310044d51fb4bd31134606af`. Build PASS; related song/auth
regression 34/34 PASS. candidate-gate-and-estimates.json and screenshots verify
estimate labels, disabled new style inputs, no Continue control and the explicit
World interpretation gate in desktop/Pixel 7 emulation. Initial two inspection
failures were harness expectations/timing, not a successful product test; third
inspection waits for the metric to render and records actual DOM observations.

T04 final verification: BLOCKED. Real local DSP/fallback was exercised through
the production frontend, with exactly one transcription request deliberately
aborted before network submission; no provider result is credited to that test.
Initial stored result: duration 16 s, tempo estimate 117.5, key estimate C major,
provider beatvision-local-dsp, transcription_status=failed. Later read-only
inspection found the fixture analysis updated at 06:55:20Z with Groq metadata,
transcription_status=unavailable and transcript content. The cause/actor is
UNKNOWN; preserve that state and do not attribute it to the earlier blocked
request or claim verified transcription. No creative content was approved.
Missing interpretation schema/functions and a coordinated rollout remain the
external dependency. See SPONSOR_DEMO_RELEASE_GATES.md for exact migration hashes,
function/configuration dependencies and the scoped CI evidence limit.
Next task: T09 (independent); T05–T08 remain blocked by T04.

### TASK ID: T05
Objective / acceptance: Sponsor reveals, edits, explicitly approves and reloads
a versioned world derived from the confirmed interpretation; earlier approved
worlds remain intact.
Initial status: TODO.
Evidence inspected: candidate-world-gate screenshots and source under T04 boundary
testing show explicit interpretation gate; no World generation was submitted.
Confirmed blocker: T04's missing deployed interpretation/backend and sponsor
confirmation; generation/free-provider proof and explicit approvals also required.
Files changed: None.
Commit: Baseline identities above.
Tests performed: No full World journey; only blocked boundary observed.
Verification: BLOCKED.
Next task: None dependency-ready after independent T09.

### TASK ID: T06
Objective / acceptance: Sponsor generates/edits/reviews Style Bible, characters,
environments and identity, explicitly approves them, and reloads authoritative
versions consistent with the approved world.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T05; agent cannot approve creative work for user.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: BLOCKED.
Next task: T07 only when T05/T06 can be verified with sponsor approvals.

### TASK ID: T07
Objective / acceptance: Story/storyboard derive from approved interpretation and
identity, cover actual song duration, preserve variants, and require explicit
scene-instruction approval; reload verifies persistence.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T06.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: BLOCKED.
Next task: T08 only after T06/T07 and sponsor approval.

### TASK ID: T08
Objective / acceptance: Real provider-generated scene imagery uses approved
inputs, persists privately, supports reject/new variants without destroying
approved assets, and receives sponsor approval before motion.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T07 and verified zero-cost/authorized provider use.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: BLOCKED.
Next task: T10 only after approved T08 input and T09 safeguards.

### TASK ID: T09
Objective / acceptance: Verify existing worker/model and server authentication,
owner/project authorization, approved image and scene instructions, available
credits/no-overage controls, idempotency, bounded polling, private persistence;
no inference until execution authorization and cost evidence exist.
Initial status: TODO.
Evidence inspected: Live generation v59 bundle; candidate adapter/controller/
worker; modal-capability-auth.json; local transport red/green test logs.
Confirmed blocker: Current Modal worker/account credit/no-overage evidence and
execution authorization missing; capability merely attests configured env flags.
Provider-side duplicate reconciliation after an uncertain receipt is unverified.
Files changed: supabase/functions/beatvision-generation/modal-motion.ts;
scripts/test/modal-motion-integration.test.mjs; task evidence/checklist.
Commit: `fbbcb3d5697f39dcdfd95e32ca77ce58dc46349b`.
Tests performed: Real browser read-only capability: own project HTTP 200,
modal_supported=true/modal_available=true/model LTX 0.9.5; independently confirmed
existing foreign-owned project HTTP 404; unauthenticated HTTP 401. No Modal worker
contact or GPU inference. Offline adapter 14/14 PASS after four baseline failures;
full source suite 413/413 PASS at transport source; audit/build PASS.
Verification: BLOCKED for complete live safeguards acceptance.
Next task: T10 only after T08/T09 PASS; otherwise document dependent blockers.

#### T09.1 — Bound credentialed Modal transport (scoped source defect)

CONFIRMED: deployed beatvision-generation v59 bundle hash
`6a1b41a335a223a79f0505799f9ead17137fd05c396c93cc94a41de10c1314d4`
contains the same Modal adapter transport as the candidate: no redirect policy,
20-second abort timer cleared before `response.text()`, and no JSON-body size
limit before base64 parsing. Thus safe polling is not bounded through body read.
Hypothesis to reproduce: oversized or stalled response consumes unbounded memory
or time; redirect following risks sending Modal credential headers elsewhere.
Required files: supabase/functions/beatvision-generation/modal-motion.ts;
scripts/test/modal-motion-integration.test.mjs. Expected outcome: exact fixed
provider origin with redirects rejected; 20-second timeout through body read;
bounded JSON that still accepts an 8 MiB base64 clip; no automatic retries.
Verification method: offline failing/passing real adapter stream tests, existing
generation tests, production audit and build. No live provider call required.
Status: PASS for the offline repair. Four baseline failures recorded in
evidence/sponsor-demo-20261022/modal-transport-red.txt; 14/14 adapter tests PASS
in modal-transport-green.txt after repair. Full npm test: 413 PASS, zero failed,
zero skipped (npm-test.txt). Production audit PASS; TypeScript/Vite build PASS
(existing >500 kB bundle warning). Source changes have not been deployed.
T09 live/billing acceptance remains BLOCKED. No GPU submission or paid service.

T09 read-only inspection also confirmed app-layer getUser/owner checks before
capability/enqueue; exact approved source image/project/plan/scene binding;
conditional queued-job claim; model SHA pin; upload upsert:false; manifest hashes.
These source checks do not prove live authorization or remote GPU idempotency.
Worker bridge source unconditionally spawns a call on valid submit; durable
provider-side duplicate suppression is not demonstrated. No worker/billing
request made because even a web cold start can consume resources.

### TASK ID: T10
Objective / acceptance: Exactly one authorized real GPU job from the approved
scene uses the intended model/prompt/image, produces approximately 2 seconds of
AI subject motion, with job ID/provenance and persisted output. No retry while
job status is uncertain, no Shotstack substitute.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T08/T09 and cost/execution authorization.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None; no GPU submissions.
Verification: BLOCKED; zero GPU submissions in this mission.
Next task: T11 only after authorized T10 completion.

### TASK ID: T11
Objective / acceptance: Fetch exact T10 output, record checksum/size/container,
fully decode video and duration, visually verify subject movement and source
identity, and actually play in BragoraForge desktop and Android contexts.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T10. Metadata alone cannot satisfy motion/playback.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: BLOCKED.
Next task: T12 only after real motion/identity and playback verification.

### TASK ID: T12
Objective / acceptance: After verified clip playback, frontend accurately explains
observed resource limits and full-song sponsorship needs; distinguishes
demonstrated, unverified, funding-dependent and planned capabilities. No fake
success or arbitrary disabled pipeline.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T11 and genuine current resource-limit evidence.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: BLOCKED. Resource requirements documented in release packet;
an actual resource-exhaustion stopping point has not been established.
Next task: T13 only after T11/T12 verification.

### TASK ID: T13
Objective / acceptance: Run actual frontend stages sequentially under isolated
sponsor identity on desktop/Android; record network/console/media evidence and
all creative approvals by sponsor. Run relevant exact-source CI/build checks.
Initial status: TODO.
Evidence inspected: Auth/intake/local DSP/candidate boundary and capability
artifacts; local regression/build results. Retrieved baseline CI success in T01.
Confirmed blocker: T04–T12 block the required complete frontend sequence; no
creative approvals can be performed on the sponsor's behalf.
Files changed: None.
Commit: Baseline identities above.
Tests performed: Partial real frontend evidence only. No complete sponsor journey
or physical Android device test. Local full suite 413/413, related UI suite
34/34 and build are source checks, not end-to-end acceptance.
Verification: BLOCKED.
Next task: T14 delivery can report evidence/blockers, without claiming readiness.

### TASK ID: T14
Objective / acceptance: Deliver committed checklist, focused reviewable PR,
exact reachable preview identity/access instructions, verified CI/build and
journey evidence, real authorized Modal proof, blockers and measured funding
needs. Do not declare readiness while mandatory tasks are unresolved.
Initial status: TODO.
Evidence inspected: All task records and SPONSOR_DEMO_RELEASE_GATES.md.
Confirmed blocker: Depends on T13; final delivery may report blockers honestly
without satisfying sponsor-demo acceptance.
Files changed: Authoritative checklist, task evidence, release gate/resource
packet and PROJECT_LOG.md; focused source commits listed above.
Commit: Source `b8baeaad49508577310044d51fb4bd31134606af`; documentation delivery
commit `cf2ccb34a2589fe934193aa1f8c2eb145d273332`; remote-validation.json.
Tests performed: No verified final demo; preserve existing draft PR #141.
Verification: BLOCKED for mandatory sponsor-demo delivery, despite reviewable
partial improvements/evidence.
Next task: None.

Remote delivery verification (partial deliverables, not a sponsor-demo PASS):
existing PR #141 remains draft/open, updated with current scope and retained
prior verification history. Exact review head `cf2ccb34…` has completed-success
[Production CI 39738730339](https://github.com/DaddyDom8249/BeatVision/actions/runs/39738730339),
[PostgreSQL contract replay 39738730165](https://github.com/DaddyDom8249/BeatVision/actions/runs/39738730165),
and [Modal offline 39738730312](https://github.com/DaddyDom8249/BeatVision/actions/runs/39738730312).
Retrieved Production CI logs confirm 413 PASS, 0 FAIL, 0 SKIP, audit PASS,
and build success under Node 22. Vercel/CodeRabbit statuses report success.

Exact candidate preview: https://beat-vision-f8nn-e4akic7tp-beat-vision.vercel.app/
Vercel `dpl_6KvH3vMdh6XjsNwAwa7baX1kmx6t`, READY, source `cf2ccb34…`,
preview target (not production). Authorized Vercel fetch returned HTTP 200 for
`/auth` and `/assets/index-DsW2PLBW.js`, whose content includes the estimate
labels/explanation. This is not hosted interactive browser journey proof.
Preview may require the owner's Vercel authentication; register/sign in to the
app separately. Backend schema/function gates still block Song Intelligence.
Later evidence-only commits do not change the app source verified here.

## Motion verification

Motion verification| Result
---|---
Request authorized| UNKNOWN
GPU job submitted| UNKNOWN
Inference completed| UNKNOWN
MP4 persisted| UNKNOWN
Video decoded| UNKNOWN
Visible subject movement| UNKNOWN
Browser playback| UNKNOWN

No GPU request has been submitted in this mission.

## Deferred findings

DEFERRED: sign-out control absent from inspected header/dashboard (registration
and login are the mission's required auth gate; no extra auth feature added).
DEFERRED: Vite reports a >500 kB bundle; no unrelated bundle redesign.
DEFERRED: Supabase security advisor reports API-executable definer routines and
disabled leaked-password protection. Warnings alone do not establish an exploit;
no unrelated security changes performed. Guidance:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Retry ledger

T02 initial login capture observed only Loading. Second capture waited for the
settled empty dashboard; PASS. No duplicate signup/email send.
T04 candidate inspection 1 expected a disabled button; source instead omits it.
Inspection 2 asserted all metrics before they settled; failed without establishing
which predicate. Inspection 3 waited for metric text and recorded actual DOM
values/screenshots; PASS for estimate labels/gates. No further retries.
T09.1 red tests reproduced four failures; one source repair made all 14 adapter
tests PASS. No provider/GPU retries or submissions. npm ci failed because the
repository intentionally has no lockfile; followed its npm install workflow
without generating a committed lockfile. Missing optional skill reference was
not available; no implementation relied on its contents.

## Change gate

Before each source edit, record task ID, confirmed defect/root-cause hypothesis,
required files, expected result and verification method. This initial checklist
is a documentation change based on read-only evidence, not a source repair.

## Resumed execution — user-authorized release

User instruction after the release/approval/GPU explanation: “Do it”. This
authorizes releasing the reviewed backend/frontend changes and proceeding with
safe verification. It does not supply a spending cap or approve unseen creative
content. T04 is the sole active task; all other statuses retain their evidence.
Read-only recheck: PR #141 remains draft at `d375f326…`, production remains
`4a2ebf8…`, and the four candidate migrations/functions are still absent.
Before production changes: inspect current object types/grants/triggers and
candidate migration bodies, validate compatibility, retain previous deployed
function sources for recovery, then release the existing candidate in order.
No schema weakening, customer-content writes or new services are authorized.

### T04.2 — Test valid generation lineage before release

Testable hypothesis: `reject_unlineaged_new_generation()` declares `world_id`
and also queries a world_reports relation containing a `world_id` column with
`w.id=world_id`; PostgreSQL may reject the valid generation path as ambiguous.
Existing PostgreSQL assertions exercise fingerprints/quotas but do not insert a
fully valid Vision Lock and generation job. Before source changes, reproduce in
the existing isolated QA project `llkzohajsoikdbuslxzb` using synthetic rows in a
transaction ending ROLLBACK. No real creative content, production writes or
provider work. If confirmed: add a forward migration disambiguating that local
variable and extend the PostgreSQL contract's successful/invalid lineage tests.
Expected result: valid lineage can enqueue; missing/stale/foreign lineage is
still rejected. Required files, if confirmed: a new Supabase migration,
scripts/test/postgres-song-intelligence-assertions.sql and its CI workflow list.

CONFIRMED: rollback-only QA test failed with PostgreSQL `42702`, “column
reference world_id is ambiguous”, in reject_unlineaged_new_generation() line 22
on a valid synthetic image job. Production remains unchanged. Root cause is the
local world_id variable colliding with world_reports.world_id. Required fix is
to rename only that local variable in a forward migration, retaining the complete
lineage/owner checks and existing service-only execution ACL. Add real-PG tests
for valid, foreign-project, missing-lock and stale-source job inserts. One repair
attempt planned; no provider requests involved.

T04.2 result: QA forward migration applied successfully; the expanded
rollback-only contract passes valid/foreign/missing/stale lineage, ownership,
ACL and quota checks. Commit `5699c35f56726ac7597be1b653ca3f8b30ce64e3`.
Existing original migration bodies remain unchanged. Production is unchanged.

### T04.3 — Verify release configuration without inference

Confirmed access limitation: connected Supabase supports deployment and SQL,
but CLI `secrets list` fails because SUPABASE_ACCESS_TOKEN is unavailable. New
required Arena allowlist and creative-provider settings therefore cannot be
inspected through the CLI. Hypothesis: some may already be configured.
Required files: supabase/functions/beatvision-generation/index.ts and
scripts/test/modal-motion-integration.test.mjs. Extend the existing authenticated,
owner-scoped read-only modal_capability response with non-secret configuration
booleans only. Expected outcome: verify deployment prerequisites without a job,
provider HTTP request, secret disclosure or financial-flag change. Verification:
offline handler cases for configured/missing settings and zero outbound calls,
then read-only live capability after deployment. If Arena configuration is
missing, preserve the working controller rather than release a known break.

T04.3 source result: new owner-only configuration fields reproduced missing
baseline behavior, then passed configured/missing/no-provider-call tests.
15/15 Modal/preflight tests PASS; full source suite 414/414 PASS, zero skipped.
Commit `69a9578d4952ce8a8cc9ac9951b822c55941187a`.

### T04.4 — Authorized coordinated production rollout

Authorization: user's “Do it” following the explicit release explanation.
Compatibility evidence: live prerequisite column types match the tested schema;
pgcrypto is in extensions; authenticated has no table-level INSERT/UPDATE on
songs, so protected new authority fields cannot be forged through broad grants;
no active generation jobs. Existing object counts captured read-only before
release. QA valid/invalid lineage contract PASS after the forward correction;
real PostgreSQL CI workflow_dispatch run 39818827550 PASS at `5699c35f…`.
Release the five existing migration bodies as one transaction with lock/statement
timeouts to avoid exposing intermediate trigger ACL/lineage states. Preserve
their source paths/hashes in the release evidence; the live history will record
one named bundle. No content updates or creative approvals. Then deploy the
matching owner-authenticated functions, verify non-inference capability and new
schema, and release the exact frontend commit to the existing Vercel production
project. Existing function sources are backed up privately outside Git.

Production result so far: bundle `20261022170451` applied; existing table counts
unchanged (37 projects,19 songs,20 worlds,8 locks,43 image assets,40 motion assets,
163 jobs). New RLS/authority grants and corrected trigger verified. Functions:
analyze-song v40, interpretation v1, AI Director v1, World v60, Style v28.
Candidate generation v60 preflight returned arena_configured=false,
free_transcription_configured=false, interpretation_proposals_configured=false.
Preserved the prior controller and deployed only the compatible Modal transport
module as generation v61; full new Arena controller remains config-blocked.
Frontend `69a9578…` is READY at production `dpl_DCEUiJhxMzsTJB3HyNRan2jQs8Lf`.
Actual desktop/Pixel 7 login, interpretation GET HTTP 200, enabled style fields,
absence of old schema warning and 254.48-second song playback verified.

T04.1 follow-up discovered only after the panel became live: it describes tempo
and key under “Verified song evidence” and the next-step button ignores missing
interpretation confirmation. Required files: SongInterpretationPanel.tsx,
SongPage.tsx and an existing related runtime test. Root cause: new panel labels
and next-step conditions did not share the World page's confirmation condition.
Expected outcome: label estimates consistently and disable Continue until a
persisted confirmed interpretation exists and song edits are saved. Verify both
unconfirmed/confirmed cases without approving real user content, then browser
check on the released build. Keep server and World-route approval gates intact.

Follow-up source tests: reproduced two failures for unconfirmed/unsaved Continue
states, corrected the condition and panel's estimate labeling. Full npm suite
416/416 PASS, zero skipped; audit and TypeScript/Vite build PASS. No real
interpretation confirmation performed. Final frontend redeploy/verification next.

Release CI observation: PR-triggered runs did not appear for the new push in this
credential context; the existing SQL workflow's manual dispatch did run and PASS
at the exact migration-fix SHA. Required file: .github/workflows/production-ci.yml.
Add workflow_dispatch alongside its existing triggers, preserving every check
and permission. Expected outcome: run the unchanged Node 22 test/audit/build
steps for the exact release branch through an explicit authorized dispatch.
Verification is the real workflow result, not a YAML-text assertion. No new
services, secrets or bypassed checks.

Final release regression plan: after the corrected frontend is live, create one
new synthetic QA project with the existing locally composed WAV. This isolates
post-migration upload/style/draft writes from the earlier project that now holds
user-provided audio. Verify actual DSP with transcription blocked before network,
persist a clearly synthetic manual interpretation draft and reload it. Do not
confirm it. Verify Continue remains disabled and no confirmed pointer appears.
This tests the newly deployed schema/RPC lifecycle without approving user content
or submitting any provider/GPU inference.


### T04 resumed verification — final deployed behavior

Verification: BLOCKED for the complete acceptance criterion; release, local DSP
and manual-draft persistence verified. Source commits: migration correction
`5699c35f56726ac7597be1b653ca3f8b30ce64e3`, read-only preflight
`69a9578d4952ce8a8cc9ac9951b822c55941187a`, estimate/confirmation gate
`235b0737c82e60b882388974fed972ab006995b2`, CI dispatch
`63604806744e6d306742c75d399cc001c00aa0e4`.
Production final deployment `dpl_HBVecpyByZ6czJvLHvuHwWajis2W` READY at
https://beat-vision-666cwas4i-beat-vision.vercel.app/ with the original
https://beat-vision-theta.vercel.app/ alias; exact frontend SHA `636048067…`.
Production CI 39821652295: 416/416 PASS, zero skipped, audit/build PASS.
Earlier dispatch 39821481478 FAILED because Chromium did not start within the
existing test's 10-second limit; later same-SHA PR run passed without removing
checks. Modal offline 39821652417 PASS. Migration-fix PG 39818827550 PASS.

Actual frontend created ONE new synthetic project
`ad266b2c-3e9b-45fb-b8ab-5aabacfe3ac4`, preserving existing project/audio.
Saved WAV, style and Notes persisted after reload. Browser DSP completed with
transcription deliberately aborted before network. Manual draft v1 persisted,
server SHA-256 equals the original b82c95… fixture, confirmed pointer remains
null. Continue is disabled and actual World route presents confirmation gate.
Desktop/Pixel 7 no page errors or overflow; mobile playback advances at 16 s.
Evidence: final-release-synthetic-regression.json, synthetic screenshots and
production-release-manifest.json. This proves no AI transcription or meaning.
Two harness observations were corrected before the successful resumed test:
Auth exact selector omitted the arrow; Notes accessible name includes textarea
content after persistence. Read-only DOM/SQL inspection confirmed saved Notes;
the test switched to its placeholder, reused the same project and did not
repeat upload or create another fixture. No creative approval performed.

Specific external blockers: dedicated free-provider plan/budget evidence and
secure configuration access. Runtime preflight verified all three new
provider/Arena configuration booleans false. Supabase management CLI has no
access token; connected tools do not edit secrets. Owner was asked via async
input for secure configuration route and current provider billing facts. Do
not paste credentials into chat or enable financial attestation flags without
evidence. Then an artist must review and confirm their own interpretation.
Next task: T09 (independent read-only access/safeguard verification).


### T09 resumed verification — released transport and remaining account access

Objective: establish safe current provider execution access without inference.
Initial status: BLOCKED. Evidence inspected: production generation v61 deployment
receipt and component hashes, prior authenticated capability/foreign/anonymous
checks (authorization controller unchanged), exact-head Modal offline CI
39821652417 PASS, existing authorized Termux phone-status results.
CONFIRMED: phone bridge reports offline. Historical completed read-only CLI job
3b56352a-ccde-43f0-93f8-29b726e23586 found Modal CLI and app ID
ap-CopCZqKwTuk11VLpDSU0fH, zero displayed tasks, billed cost $0.00 after credits.
That output does not state remaining credit balance, expiry or enforceable hard
spending limit. It is not fresh worker/model availability evidence. No new
phone command queued, app invoked or GPU job submitted. Evidence:
modal-existing-access.json. No direct Modal account credentials are bound here.
Files changed: checklist/evidence only in this resumed verification; transport
source at fbbcb3d… was deployed compatibly during the coordinated T04 release.
Commit: frontend 636048067…; generation v61 component hashes in release manifest.
Tests performed: offline source tests PASS; current provider inference NOT RUN.
Verification: BLOCKED by current billing/cap proof and provider account access;
remote duplicate reconciliation after uncertain receipt still unverified.
Next task: no dependency-ready execution tasks. T10 additionally needs T08's
artist-approved scene; T11 has no mission output to decode/inspect/play; T12
cannot claim demonstrated technology or actual full-song resource exhaustion;
T13 cannot run the complete sequence; T14 delivers review evidence only.

Final mandatory status: T01–T03 PASS, T04–T14 BLOCKED with the dependencies above.
No item is IN_PROGRESS. MVP is not sponsor-ready. Pending owner inputs are secure
configuration access, verified provider plan/credits/hard cap and subsequent
explicit artist review/approvals. No unapproved compute, content approval,
full-length experiment, new infrastructure or main/PR merge occurred.


### T09.2 — User-provided Modal financial settings evidence

Objective / acceptance: record exactly what the five supplied screenshots prove
about the existing beatvision workspace; distinguish usage allowance, credits
and spend protection; retain the storage exception. Initial status: BLOCKED.
Evidence inspected: attached files1000088085/87/88/90/92.jpg, current environment
credential readiness, existing phone-status heartbeat and existing worker source.
Confirmed blocker before this update: no direct screenshot of configured spend
limit. Required files: checklist, release gates, PROJECT_LOG and a sanitized
screenshot-observation artifact with hashes. No application source change.
Expected outcome: remove the spend-limit-evidence blocker to the extent supported,
retain other actual dependencies, and make no inference or configuration change.
Verification: inspect original images, hash them, compare annotations against
visible text and worker configuration; no repeated browser/provider tests.


T09.2 verification result: PASS for screenshot-level configured safeguard and
usage observations; T09 remains BLOCKED overall. The supplied beatvision Starter
workspace shows usage limit$42.50 including credits, spend limit$0, total usage
$0.12 (L4$0.09,CPU$0.02,memory$0.01), egress1.11GiB with estimated charge$0.00.
Modal explicitly excludes Volume storage from the workload-stop safeguard.
Do not repeat the prior assertion that configured spend-limit evidence is absent.
$42.38 is the arithmetic gap to the usage cap, not a verified credit balance.
Credit expiry and capture date are not shown. Truncated app names do not verify
an exact worker revision, inference completion or subject motion.

Current environment readiness has no secret/identity bindings; phone bridge
still reports offline (last heartbeat2026-10-22T16:33:15.842Z). No new phone
command, provider invocation, GPU submission, configuration change or creative
approval. Repository worker has no persistent Modal Volume configured; deployed
source equivalence is unverified. Original billing images retained privately;
SHA-256 references and exact visible observations in
modal-user-financial-evidence.json. Existing tests/deployment are unchanged, so
no redundant build/CI/journey run. Documentation integrity/hash checks only.
Files changed: this checklist, SPONSOR_DEMO_RELEASE_GATES.md, PROJECT_LOG.md,
modal-user-financial-evidence.json and artifact manifest. Commit: evidence-only
commit following da01e814c7073a09a3f33ca24b1ec237c39f2e5d; unchanged released
app SHA63604806744e6d306742c75d399cc001c00aa0e4. Next task: none dependency-ready;
restore existing account/bridge access and remaining provider setup, then artist
review/approvals before T10. No inference authorized or attempted by these images.


### T04.5 — Investigate screenshot-reported Edge Function request failures

Objective: interpretation/transcription requests from the actual supported app
origin must reach the authenticated endpoint and return honest structured results.
Initial status: FAILED in supplied screenshot; exact origin/root cause UNKNOWN.
Evidence: user attachment1000088094.jpg shows “Failed to send a request to the
Edge Function” in interpretation and transcription; local DSP249.6s persisted.
No claim that this is a provider cost response. User's page URL is not visible.
Testable hypothesis: immutable release URL was supplied but is absent from the
exact Edge CORS allowlists. Compare allowed production/immutable origins on real
OPTIONS and read-only authenticated frontend calls; inspect deployment/logs.
No transcription/proposal POST, inference or writes to the depicted user project.
Potential required files if confirmed: affected function origin allowlists and
related CORS tests; smallest exact-origin correction only, no wildcard or auth
relaxation. Record confirmed cause/files before any source change.


T04.5 confirmed defect before source edit: real OPTIONS to both deployed
interpretationv1/analyze-songv40 returns HTTP200 but no Allow-Origin for the
published immutable release origin, while canonical theta origin is allowed.
Source/live bundle hashes match the known release. Production frontend still
636048067…/dpl_HBVecpyByZ6czJvLHvuHwWajis2W; remote branch unchanged. Logs do
not expose an Origin value, so the supplied screenshot's exact cause remains
PROBABLE until the user identifies their URL. Supabase current CORS docs confirm
missing Allow-Origin causes browser invocation failure. Changelog reviewed;
no SDK upgrade or schema change needed for this exact-origin defect.
Required source files: beatvision-song-interpretation/index.ts and
beatvision-analyze-song/index.ts; existing interpretation/analysis handler tests.
Expected outcome: exact owned immutable release origin allowed on preflight and
structured auth/error responses; untrusted/lookalike origins remain rejected.
Verification: failing real-handler tests before the two-line allowlist fix, green
after; direct live preflights and actual read-only authenticated browser calls.
No wildcard, auth relaxation, provider call or user-project write. Other stage
origin gaps are recorded for dependency-ready verification, not silently fixed.
Termux retry requested by user now returns online, fresh heartbeat17:56:47Z.
This restores bridge transport access; it is not GPU/worker/inference proof.


T04.5 steering: user confirms failing page is canonical theta origin. Therefore
missing immutable-release CORS is a separate confirmed defect, not an established
cause of this screenshot. Defer its source change while tracing actual production
requests. No source file has changed. Next evidence: real read-only browser
interpretation GET on canonical site, request header names, failure messages,
function version/status and comparison with Android browser context.

T04.5 confirmed canonical-origin defect before source changes: actual Chromium
fetch without trace header reaches both endpoints and returns401; identical
request plus standard traceparent fails preflight with “Request header field
traceparent is not allowed”. The current SDK's exported CORS header list includes
x-retry-count/traceparent/tracestate/baggage; both handlers hardcode only the old
four headers. Screenshot user's actual requested header names remain UNKNOWN;
this is a reproduced compatible failure path, not proof of their exact header.
Required files: the two function index.ts files and their two existing handler
tests. Expected change: synchronize only allowed request-header names with the
SDK, preserve exact origin restrictions, methods, getUser/owner checks and cost
gates. Tests will compare real handler responses with SDK-exported header names,
retain denied-origin cases, and prove unauthenticated errors stay401. Run red
first, then green and the live browser reproduction. Defer the independent
immutable-origin defect. No provider/GPU submission or actual user content write.


T04.5 verification: PASS for reproduced SDK-header CORS path after deployment;
complete T04 remains BLOCKED. Handler regression before patch:20 PASS/2 FAIL
(missing SDK headers); after patch22/22 PASS,0 skipped; production audit PASS.
Commit2baa6a3041521a8646957b79cdedc50358ff420c changes only two header strings
and related tests. Released interpretationv2 (bundle5a6704dd…) and analyze-songv41
(bundle9c2a4666…); candidate contents byte-compared to committed source first.
Actual Chromium on canonical theta now reads401 both with/without traceparent;
before, traced requests failed CORS. This is unauthenticated rejection, not a
successful creative request. Actual authenticated frontend reads with all SDK
trace headers load draftv1 HTTP200 in desktop/Pixel7; a deliberate empty analysis
request returns structured400 projectId required before any provider call. The
400 console messages are expected validation errors, not CORS failures.
Evidence: canonical-edge-diagnosis.json, canonical-trace-cors-red/green.json,
traced-app-browser-green.json, cors-header-release.json. Screenshot's exact
client header remains UNKNOWN; user asked to reload/retry, no approval required.
No production frontend/schema change or real user project write. Next: T09
read-only existing bridge account checks; T04's provider/config/artist gates stay.


T04.5 final remote validation: Production CI39828722358 PASS on exact
2baa6a3041521a8646957b79cdedc50358ff420c:418/418 tests,0 skipped,audit/build PASS.
The screenshot is retained privately with its original SHA256 in
cors-header-release.json. User confirmed canonical theta URL. User-device retry
result is still UNKNOWN; do not report screenshot fully resolved from emulation.
DEFERRED under T04.5: immutable-host origin allowlist gap was reproduced but is
not the origin the user reports. No unrelated origin/source changes made.
Current deploy identities: frontend636048067… unchanged; interpretationv2 and
analyze-songv41 as recorded in release artifact. No provider call or approvals.

### T09 bridge retry / read-only checks

Objective: use restored existing bridge access for non-inference account/worker
verification. Initial status: BLOCKED. User explicitly requested bridge retry.
Evidence: heartbeat became online at17:56:47Z; existing bridge job
2daf31ff-5148-4db5-b5e3-d841f9c50d9d completed exit0 and confirmed phone can
reach both canonical-origin preflight endpoints with200. That command was queued
before deployment; its output shows the old four headers and no completion
clock, so it is not post-patch physical-device proof. New read-only Modal job
63c49cf7-1070-4b9a-a3ab-df9cfa991942 is awaiting_approval (bridge tool explicitly
requires approval on the phone). Latest observed heartbeat18:09:06Z, offline
at retrieval. Command uses existing Modal CLI/SDK to list apps, billing summary
and Function.get_current_stats; no remote/spawn/run/deploy/GPU invocation.
Files changed: task/evidence/release docs only for T09; no provider/worker code.
Commit: evidence update following2baa6a3041521a8646957b79cdedc50358ff420c.
Tests performed: phone preflight PASS (read-only network access); Modal check
NOT EXECUTED pending bridge approval. Approval is imposed by the bridge tool,
not an invented additional inference permission. No duplicate command queued.
Verification: BLOCKED by required phone approval and subsequent actual worker/
financial/approved-input checks. Next: resume this same job when its result
arrives; never substitute historical usage or mere bridge status for GPU proof.
All mandatory statuses remain T01–T03 PASS/T04–T14 BLOCKED; no IN_PROGRESS item.


### T09 read-only command retry2 — owner requested approval resend

Objective: resend a working non-inference Modal account/status check.
Initial status: BLOCKED. Confirmed evidence: bridge online with heartbeat
2026-10-22T19:52:48.452Z; old job63c49cf7-1070-4b9a-a3ab-df9cfa991942 is
failed/exit127, “timeout: failed to run command /root/modal-env/bin/python:
No such file or directory”. It was approved, but the command ran a Debian path
outside Debian. Prior successful job3b56352a uses proot-distro login debian.
Changed hypothesis for retry2: use that existing wrapper around the same bounded
read-only CLI app list/billing summary and SDK Function.get_current_stats.
No new install, credential inspection, GPU invocation or provider configuration.
New approval requestb23ccbf0-449e-4e69-9a4d-32188083f5fa is queued; tool says
“Required on phone”. User explicitly requested resending the approval request.
Files changed: documentation/evidence only; app source remains2baa6a3041521a8646957b79cdedc50358ff420c for the last backend correction.
Tests performed: prior command failure retrieved; successful wrapper inspected;
new command NOT EXECUTED at queue receipt. Verification: BLOCKED pending bridge
approval/execution result. Next: inspect this same new job; do not duplicate it
or infer Modal/GPU readiness from queue acceptance. Attempt count2/3 for this
read-only status-command blocker. No GPU submission.


### T09 completed read-only result after user “Go”

Approved jobb23ccbf0 completed exit0. Modal SDK1.6.2 lists existing
ap-CopCZqKwTuk11VLpDSU0fH / bragoraforge-modal-motion-proof as deployed,0 tasks.
Function.get_current_stats resolves the existing function and returns backlog0,
num_total_runners0,num_running_inputs0,input_headroom0. Billing displays metered
$0.16,deployed apps$0.12,egress$0.04 with-$0.04 allowance, credits applied-$0.12,
billed$0.00. No new GPU/container/inference was invoked. This proves authenticated
control-plane access and idle registered function, not loaded model/GPU capacity,
remaining credit balance or a valid MP4. Evidence: modal-control-plane-verified.json.
Verification: PASS for account/app/stats/ledger reads; overallT09 remains BLOCKED
on remaining live execution/approved-input prerequisites. No command retry needed.
Next dependency-ready task:T04 secure existing CLI/config access inspection.

### T04.6 — Check existing phone Supabase management access

Objective: determine whether the existing phone has an authenticated Supabase
CLI that can inspect relevant secret-name presence, without reading secret values.
Initial status: BLOCKED. Connected tools still lack secret-edit capability;
workspace has no bound credentials. The newly working authorized phone may have
existing CLI login; this is a testable access hypothesis, not a credential claim.
Required files: checklist/evidence only. No app source or settings change planned.
Use known working proot-distro Debian wrapper, existing CLI or cached no-install
npx command only. Discover secrets-list help before using --project-ref. Print
only requested secret-name presence and auth-read success, never secret values
or digests. No inference, installation, login prompt or financial flag changes.
Verification: actual read-only CLI result. If unavailable, record exact missing
access; do not search credential files or repeat this probe without new evidence.


T04.6 approval resend: original job5c2f0d64 was declined on phone before
execution. User explained accidental input and explicitly requested resending.
Identical read-only command requeued once asbadbf87f-6bc2-434c-8fbe-583ff93f0920;
bridge requires on-phone approval. No command execution result yet, settings
change or provider/GPU call. CurrentT04 BLOCKED on that approval; no active task.


### Approval batching preference and T04.6 execution retry2

User requests bulk approval requests to avoid repeated app switching. Persisted
preference: combine related dependency-ready read-only diagnostics into one
Termux script, with conditional branches and sequential execution after one
phone approval. Keep one checklist task active. Collect outstanding decisions
in one message when reviewable; no blanket approval of unseen creative work,
financial attestation or unknown-cost execution.

Result of approved badbf87f: bridge process completed exit0 but CLI help failed
exit1 with Unsupported platform: android; stack path is Termux's global Supabase
JS wrapper and Node24.18.0. Management secret-name read was NOT EXECUTED. This is
not successful Supabase access. Testable correction: select an existing native
Linux Node in Debian and invoke the existing CLI entrypoint using it and a clean
Linux PATH. No install, login, credential-file inspection or settings mutation.
Batch also checks canonical function preflight/SDK-header coverage from the phone
after the deployed correction (previous phone check had old headers). Required
files: checklist/evidence only; no app source. Expected outcome: one approval
resolves runtime/access/header observations, or records exact remaining access.
Retry2/3 for actual CLI execution blocker; accidental rejected prompt is not a
CLI execution attempt. No repeated Modal bill/stats queries or GPU invocation.


Batch queued as900e072e-70d0-4005-acfe-b061779596c1; bridge returns Required on
phone. One approval covers the related diagnostic branches above, in sequence.
T04 BLOCKED on that approval; no active task or repeated Modal checks. Current
source/deployments unchanged. Supabase access is UNKNOWN, not denied/absent,
because earlier CLI failed locally before management authentication. Evidence:
supabase-phone-access-probe.json. No source tests repeated for documentation.


T04.6 approved batch900e072e result: completed exit0; both phone OPTIONS200,
exact canonical Origin allowed, missing_sdk_headers=[] for interpretation and
analysis. PASS for post-patch phone network/header coverage, not browser playback
or AI interpretation. Management read NOT EXECUTED: no Linux Node at the two
standard paths checked. This does not prove no runtime exists elsewhere.
Read-only previous successful command metadata identifies a previously used
/root/.local/node-v22.16.0-linux-arm64 path (job1e27c7f7 and others). Retry3/3
uses that concrete existing-runtime candidate and native PATH. No install or
credential-file inspection. Final batch handles all required secret-name checks
in one approval, and omits the now-verified phone CORS checks. If this cannot
establish existing CLI management access, mark BLOCKED and require external
secure access/setup rather than repeating the runtime approach.


Final consolidated CLI requeste8641d25-720c-4f9a-b6d1-4e6bcd50a7c3 queued;
bridge requires phone approval for this changed command. No new command result
yet. Evidence: phone-postfix-cors-and-cli-runtime.json. Previous local/phone
CORS tests remain accepted; no repeat build or provider call. The next result
will close this runtime approach after attempt3/3, successful or BLOCKED.
