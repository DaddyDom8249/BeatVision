# Sponsor demo: blocked rollout and resource requirements

Observed 2026-10-22 UTC. This is a review packet, not release authorization.
The authoritative task status is [SPONSOR_DEMO_TODO.md](SPONSOR_DEMO_TODO.md).

## Verified starting state

Production frontend is Vercel `dpl_FgoTWCHFi8WZnAgwbQP8RzQzpCkT` at
`4a2ebf8bf3e9f30f0cf35442f86662bb6296da86`.
Production Supabase is `mdofsinyofqbeapzfygu`.
A fresh confirmed sponsor account created isolated project
`a4841264-fac6-4ec9-ae07-04544493257c`, uploaded a real 16-second WAV fixture,
reloaded it and played it in desktop Chromium and Pixel 7 browser emulation.
Do not substitute these results for a completed creative/motion journey.

Actual frontend DSP saved 16-second duration, tempo estimate 117.5 BPM and key
estimate C major. Its transcription request was deliberately aborted in the
test browser before submission to prevent unknown-cost provider use. Persisted
`transcription_status=failed`; there is no successful transcription claim.
The decode used a 44100 Hz Web Audio context although the WAV source is 22050 Hz.
Stored sample_rate therefore describes decoded audio, not necessarily original
file encoding.

Later, the test project's audio and analysis changed in another session; the
actor/cause is UNKNOWN. A final read-only check verifies the current audio is
254.48 seconds and 5,649,423 bytes with matching desktop/mobile SHA-256
`2546e9caca999e16180b0196f61f57feb76dfb340db0e94d1d6f8efbd13e8343`.
Playback advances with no media error in both browser contexts. The new audio
and transcript were preserved, not attributed to the initial blocked-provider
test. Screenshots containing this later transcript remain private outside Git.
No speech-recognition accuracy, interpretation approval or full creative journey
is established by the presence of those fields.

## Smallest compatible backend path for T04

Reuse the existing Supabase project. Do not create a database or substitute the
locked contract-test fixture for a full app backend.

The four existing candidate migrations below are absent from production history.
They are unchanged from PR #141 baseline
`74f0367f2f3584669d7b91cde6b5111b470c71bc`.

Order | Migration | SHA-256
---|---|---
1 | `20261020000000_song_intelligence.sql` | `9e5301f33b8e522435b68db12dbe69ae2d0edcc4a38008a2b4f072193b1741f8`
2 | `20261020010000_song_intelligence_integrity.sql` | `497608a25943815326efcbe16efbf736f046acb219ac2b40edc294c0fac1dbd7`
3 | `20261020020000_bragora_ai_request_quotas.sql` | `74426c3c7672c76eb7b3dab5a17e0b29f2aac092e88a318cfa6f1533bc41ab67`
4 | `20261022040000_song_intelligence_trigger_execute_acl.sql` | `c83e1b7023cd5bab2aa303f1b4ecd6dfd216b93899696a4c76d1c47654e3b2d6`

These are not merely an optional style-column addition: they add interpretation
records and owner policies, source fingerprints, audit history, lineage checks
for new locks/generation, protected storage deletion and request quotas. Existing
core tables have RLS enabled; it must stay enabled. A one-column compatibility
patch would not implement the required interpretation/approval pipeline.

Retrieved exact-baseline PostgreSQL CI run
[39720271675](https://github.com/DaddyDom8249/BeatVision/actions/runs/39720271675)
reports success against an isolated synthetic PostgreSQL 17 contract fixture.
It does not establish compatibility with the complete current production schema
or existing data. No production migration was attempted in this mission.

Before an approved rollout, validate these changes against the actual schema
and existing triggers/policies in an isolated local database without customer
records; inspect the changes to new-lock and generation behavior. Preserve
existing worlds, locks, audio and approved assets. Use forward corrections;
do not erase migration history or drop data to undo a partial release.

Release the matching backend and frontend together after authorization:

- Add `beatvision-song-interpretation` and `beatvision-ai-director`, currently
  absent from the live function inventory.
- Reconcile and deploy the candidate `beatvision-analyze-song`,
  `beatvision-world`, `beatvision-style-draft` and `beatvision-generation` with
  their required local modules. Preserve current authentication and owner checks.
- Configure the verified exact Arena hostname in
  `ARENA_GATEWAY_ALLOWED_HOSTS` before the candidate generation controller; it
  intentionally fails closed without this new requirement.
- Verify each tested preview origin is explicitly authorized by Edge CORS.
  An authenticated Vercel preview alone does not configure Supabase CORS or
  provide an integrated backend.
- Verify dedicated free-provider account evidence before enabling inference.
  Candidate transcription requires `GROQ_FREE_ACCOUNT_VERIFIED=true`; current
  deployed analyze-song v39 only checks presence of `GROQ_FREE_API_KEY`.
  Interpretation/Director also need their explicit provider/model and bounded
  quota configuration; never infer billing status from the names of variables.
- Keep the Modal execution gate closed until T09 has current financial evidence.
- Re-run the fresh sponsor journey, including sponsor-authored approvals, on
  the actual deployed versions. Local build and schema-contract CI do not pass
  the release acceptance gate.

The precise external blocker is authorization for a reviewed coordinated
production schema/function/frontend rollout, together with current provider
cost evidence. This packet does not claim that the rollout itself is verified.

## Modal: required evidence before one real submission

Existing configured integration: `bragoraforge-modal-motion-proof`, private
GPU function `single_motion_proof`, proxy-authenticated submit/poll bridge.
Live generation function v59 contains the server adapter. This establishes code
deployment, not current worker health, GPU availability, credits or safe spend.

Required inputs from the operator/provider:

- Current workspace credit balance, rate and expiry, and an enforceable
  no-overage or explicitly approved spending cap. Historical $1 usage-limit
  descriptions are not current credit or zero-charge evidence.
- Explicit authorization for one bounded job within that verified cap. No GPU
  submission has been made by this mission.
- Fresh sponsor-approved image and exact scene instructions, with their immutable
  project/plan/scene/image identities and digest. The agent must not approve them.
- Confirm that no earlier job for this request is still in flight. The database
  has a conditional claim and job idempotency key, but the worker source spawns
  a GPU call for each valid submit; remote duplicate suppression/reconciliation
  after an ambiguous receipt is not proven. Never retry an uncertain submit.
- Actual worker/model availability through the authorized account, without
  using a new inference call merely as a health check.

The local transport repair at `fbbcb3d5697f39dcdfd95e32ca77ce58dc46349b` rejects
redirects carrying proxy credentials, keeps the 20-second deadline through the
body read, and limits JSON to 16 MiB while accepting an 8 MiB clip envelope.
It does not implement a provider financial cap or remote duplicate suppression.
It has not been deployed to the live Edge Function.

## Specific full-song resource needs (not a quotation)

Source-configured short-proof workload:

Resource | Configured value / evidence limit
---|---
GPU | Modal L4; one container maximum; zero minimum/buffer containers
Model | `Lightricks/LTX-Video-0.9.5`, revision `e58e28c39631af4d1468ee57a853764e11c1d37e`
Output | 704×480, 49 frames, 24 fps (~2.04 s), 20 inference steps
Execution bound | 300-second worker timeout, automatic retries disabled
Input/output bound | 8 MiB image / 8 MiB clip
Persistence | Private Supabase `visual-assets`, per-job immutable MP4 and source/provenance checks
Actual latency, GPU memory, spend per accepted clip | UNKNOWN; must be measured from authorized real job/provider usage
Current credits, price, expiry and allowable overage | UNKNOWN
Commercial model license suitability | Requires review before commercial-scale production

At that frame rate and frame count, covering 240 seconds requires at least
`ceil(240 / (49/24)) = 118` clips before transitions, overlap, rejected takes,
continuity work or higher-resolution requirements. This arithmetic is not a
claim of full-song support or a GPU cost estimate. The current 16-second fixture
is for intake testing only and does not establish long-song motion capability.

Sponsorship needs a measured allocation of capped GPU credits for those accepted
segments plus explicitly budgeted variants, provider quotas/credits for creative
inference and images, durable private media capacity, and continuity/assembly
validation. Actual required dollars and storage cannot be honestly quoted until
the authorized short clip establishes latency, output sizes and acceptance rate.

Full-length continuous subject motion, commercial quality, synchronized singing,
and scalable concurrency remain planned/unverified. A surviving Shotstack final
render or image-motion output does not prove any of those capabilities.

## Test access

Production intake route for the isolated account:
https://beat-vision-theta.vercel.app/projects/a4841264-fac6-4ec9-ae07-04544493257c/song

The account was created through the actual frontend and confirmed by its owner.
Passwords and browser session state are stored privately outside the repository
and are not included here. Independent sponsors can register with their own
email/password, confirm the email and sign in through `/auth`.

Candidate preview, independently identified as READY:
https://beat-vision-f8nn-e4akic7tp-beat-vision.vercel.app/
at `cf2ccb34a2589fe934193aa1f8c2eb145d273332`, deployment
`dpl_6KvH3vMdh6XjsNwAwa7baX1kmx6t`. Authorized Vercel fetch returned HTTP 200
for `/auth` and its built JavaScript; the estimate labels are present. Interactive
hosted-preview login/journey was not verified. It may require the Vercel owner's
authenticated access in addition to the separate application login. It is not a
verified sponsor demo: its production backend lacks Song Intelligence prerequisites.
Exact-head Production CI, PostgreSQL contract replay and Modal offline runs all
report success (remote-validation.json). Later evidence-only commits do not
change the source exercised by these checks.
