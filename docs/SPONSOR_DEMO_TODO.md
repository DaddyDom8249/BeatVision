# BragoraForge sponsor demo execution checklist

Mission opened 2026-10-22 UTC. This is the authoritative checklist for this mission.
Only one item may be IN_PROGRESS. No creative approval, production release,
production schema change, or unknown-cost inference is authorized by this file.

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
- Production: https://beat-vision-theta.vercel.app/; Vercel
  `dpl_FgoTWCHFi8WZnAgwbQP8RzQzpCkT`, READY, commit
  `4a2ebf8bf3e9f30f0cf35442f86662bb6296da86`.
- Supabase `mdofsinyofqbeapzfygu`: ACTIVE_HEALTHY, PostgreSQL 17.6.1.127.
- Modal application name supplied: `bragoraforge-modal-motion-proof`;
  current provider availability/billing not yet independently verified.

## Task index

ID| Task| Dependency| Status| Evidence
---|---|---|---|---
T01| Verify current repository, deployments, and integrations| None| PASS| CONFIRMED identities, schema/function gaps and candidate CI: evidence/sponsor-demo-20261022/baseline.json
T02| Verify sponsor registration and login| T01| PASS| signup-result.json, login-result.json: actual confirmed fresh account; desktop/Pixel 7 sign-in HTTP 200 and settled empty dashboard
T03| Verify project creation and song upload| T02| PASS| Initial create/upload/reload PASS; current 254.48-second audio read-only playback/hash verified on desktop/Pixel 7 after source change
T04| Verify music analysis and interpretation confirmation| T03| BLOCKED| Local DSP verified with transcription deliberately blocked; candidate schema/function rollout and sponsor interpretation confirmation unavailable
T05| Verify World Reveal, editing, and approval| T04| BLOCKED| T04; no confirmed interpretation or sponsor approval
T06| Verify Style Bible, characters, environments, and approvals| T05| BLOCKED| T05; explicit sponsor creative approvals required
T07| Verify story, storyboard, and approval| T06| BLOCKED| T06
T08| Verify real scene-image generation and approval| T07| BLOCKED| T07; no approved isolated sponsor scene
T09| Verify Modal configuration, authentication, and GPU spending safeguards| T01| BLOCKED| Own capability 200, existing foreign project 404, anonymous 401; worker/current credits/cap unverified; transport repaired locally
T10| Verify short real AI-motion generation from an approved scene| T08, T09| BLOCKED| No approved sponsor scene; no current GPU credit/cap proof or execution authorization
T11| Verify generated MP4 integrity, visible subject motion, and frontend playback| T10| BLOCKED| No T10 output; neither codec nor subject-motion/playback proof exists for this mission
T12| Verify clear full-length GPU sponsorship stopping point| T11| BLOCKED| No verified short proof or observed resource exhaustion; do not fabricate a funding stop
T13| Run complete sponsor-journey regression testing| T02–T12| BLOCKED| Intake and partial local DSP tested; T04–T12 prevent sequential journey
T14| Deliver verified sponsor demo URL, evidence, and remaining funding requirements| T13| BLOCKED| Reviewable source/evidence delivery proceeds; a verified sponsor-demo URL/motion proof cannot be supplied

## Task records

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
commit and remote preview/CI evidence to be recorded after push.
Tests performed: No verified final demo; preserve existing draft PR #141.
Verification: BLOCKED for mandatory sponsor-demo delivery, despite reviewable
partial improvements/evidence.
Next task: None.

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
