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
T02| Verify sponsor registration and login| T01| BLOCKED| signup-result.json: one real frontend signup HTTP 200, no session; awaiting user's email confirmation
T03| Verify project creation and song upload| T02| BLOCKED| Fresh confirmed sponsor session unavailable (T02)
T04| Verify music analysis and interpretation confirmation| T03| BLOCKED| T03; production Song Intelligence schema and function absent (T01)
T05| Verify World Reveal, editing, and approval| T04| BLOCKED| T04; no confirmed interpretation or sponsor approval
T06| Verify Style Bible, characters, environments, and approvals| T05| BLOCKED| T05; explicit sponsor creative approvals required
T07| Verify story, storyboard, and approval| T06| BLOCKED| T06
T08| Verify real scene-image generation and approval| T07| BLOCKED| T07; no approved isolated sponsor scene
T09| Verify Modal configuration, authentication, and GPU spending safeguards| T01| IN_PROGRESS| T09.1 offline reproduction/repair; live billing and worker acceptance remain blocked
T10| Verify short real AI-motion generation from an approved scene| T08, T09| TODO| —
T11| Verify generated MP4 integrity, visible subject motion, and frontend playback| T10| TODO| —
T12| Verify clear full-length GPU sponsorship stopping point| T11| TODO| —
T13| Run complete sponsor-journey regression testing| T02–T12| TODO| —
T14| Deliver verified sponsor demo URL, evidence, and remaining funding requirements| T13| TODO| —

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
Commit: Candidate baseline above; mission changes uncommitted.
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
email when required, log in/out, and reach the dashboard in desktop and Android
browser contexts; no owner-account substitution for this acceptance.
Initial status: TODO.
Evidence inspected: evidence/sponsor-demo-20261022/auth-inspection.json and
auth-desktop.png / auth-android-emulated.png; actual production frontend at
the production deployment identity above, local /usr/bin/chromium via Playwright.
Public Auth settings GET returned HTTP 200, signup enabled, email enabled,
mailer_autoconfirm=false. No signup submission or login was attempted.
Confirmed blocker: A controlled confirmation mailbox/test identity is missing.
Asked user for a non-secret test email through async input. Existing owner vault
account is not a fresh sponsor fixture and is not modified.
Files changed: None.
Commit: Candidate/production identities above; no task source changes.
Tests performed: Real sign-in page HTTP 200 in 1440px desktop and Pixel 7 browser
emulation; registration toggle and email/submit visibility observed; no page
errors or horizontal overflow. This does not prove signup, login or physical
Android behavior.
Verification: BLOCKED.
Next task: T09 (independent); T03–T08 blocked by missing fresh session.

Update: user supplied a controlled mailbox. Read-only auth.users existence check
was false before signup. One real frontend signup returned HTTP 200 with no
session and the UI's confirmation-email message (signup-result.json). Random
test password stored mode 0600 outside the repository; never logged or committed.
User asked to click email confirmation link. No confirmation bypass, password
reset, duplicate signup, or owner project changes.

### TASK ID: T03
Objective / acceptance: Fresh sponsor creates an isolated project, uploads an
actual audio file, saves and reloads it with authorized private playback and
correct duration; desktop and Android layout remain usable.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T02.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: UNKNOWN.
Next task: T04 if PASS.

### TASK ID: T04
Objective / acceptance: Real uploaded audio produces persisted signal-derived
analysis, clearly labeled interpretation, and explicit sponsor confirmation;
no heuristic presented as fact or approval gate bypassed.
Initial status: TODO.
Evidence inspected: Initial migration/function inventory indicates missing
candidate backend prerequisites; verify exact schema before any rollout.
Confirmed blocker: Depends on T03; production interpretation function absent.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: UNKNOWN.
Next task: T05 if PASS.

### TASK ID: T05
Objective / acceptance: Sponsor reveals, edits, explicitly approves and reloads
a versioned world derived from the confirmed interpretation; earlier approved
worlds remain intact.
Initial status: TODO.
Evidence inspected: None yet.
Confirmed blocker: Depends on T04.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: UNKNOWN.
Next task: T06 if PASS.

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
Verification: UNKNOWN.
Next task: T07 if PASS.

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
Verification: UNKNOWN.
Next task: T08 if PASS.

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
Verification: UNKNOWN.
Next task: T10 after T09 also passes.

### TASK ID: T09
Objective / acceptance: Verify existing worker/model and server authentication,
owner/project authorization, approved image and scene instructions, available
credits/no-overage controls, idempotency, bounded polling, private persistence;
no inference until execution authorization and cost evidence exist.
Initial status: TODO.
Evidence inspected: providers/modal_motion/README.md has historical prototype
warnings; these are not current worker or billing proof.
Confirmed blocker: Current Modal billing/credit evidence not supplied.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: UNKNOWN.
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
Status: IN_PROGRESS for offline repair; T09 live/billing acceptance stays blocked.

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
Verification: UNKNOWN.
Next task: T11 if PASS.

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
Verification: UNKNOWN.
Next task: T12 if PASS.

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
Verification: UNKNOWN.
Next task: T13 if PASS.

### TASK ID: T13
Objective / acceptance: Run actual frontend stages sequentially under isolated
sponsor identity on desktop/Android; record network/console/media evidence and
all creative approvals by sponsor. Run relevant exact-source CI/build checks.
Initial status: TODO.
Evidence inspected: None yet; PR claims are not treated as executed test results.
Confirmed blocker: Depends on T02–T12.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: UNKNOWN.
Next task: T14 if PASS.

### TASK ID: T14
Objective / acceptance: Deliver committed checklist, focused reviewable PR,
exact reachable preview identity/access instructions, verified CI/build and
journey evidence, real authorized Modal proof, blockers and measured funding
needs. Do not declare readiness while mandatory tasks are unresolved.
Initial status: TODO.
Evidence inspected: Baseline identities above.
Confirmed blocker: Depends on T13; final delivery may report blockers honestly
without satisfying sponsor-demo acceptance.
Files changed: None.
Commit: Baseline identities above.
Tests performed: None.
Verification: UNKNOWN.
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

None recorded yet. No work outside task scope is authorized here.

## Retry ledger

No blocker retries yet. Maximum three materially justified attempts per blocker.

## Change gate

Before each source edit, record task ID, confirmed defect/root-cause hypothesis,
required files, expected result and verification method. This initial checklist
is a documentation change based on read-only evidence, not a source repair.
