# Sponsor demo release and remaining gates

The authorized software release is live at https://beat-vision-theta.vercel.app/.
The full sponsor demo remains BLOCKED. The authoritative record is
[SPONSOR_DEMO_TODO.md](SPONSOR_DEMO_TODO.md).

## Released and verified

Frontend: `63604806744e6d306742c75d399cc001c00aa0e4`, Vercel
`dpl_HBVecpyByZ6czJvLHvuHwWajis2W`, READY with the original production alias.
Immutable release URL: https://beat-vision-666cwas4i-beat-vision.vercel.app/.
Existing draft PR: https://github.com/DaddyDom8249/BeatVision/pull/141.
The user authorized this reviewed release with “Do it”; no main merge occurred.

Existing Supabase `mdofsinyofqbeapzfygu` received the five Song Intelligence
migrations as one atomic, timeout-bounded bundle, history `20261022170451`, name
`sponsor_song_intelligence_release_20261022`. Original four migration bodies were
preserved. A real QA PostgreSQL test reproduced ambiguous `world_id` (42702) in
the generation trigger; forward migration `20261022165544` repairs the variable
name and expanded contract tests exercise valid, foreign, missing-lock and stale
lineage. All five source hashes and deployment receipts are in
[evidence/sponsor-demo-20261022/production-release-manifest.json](evidence/sponsor-demo-20261022/production-release-manifest.json).

Before/after release, existing counts were unchanged: 37 projects,19 songs,
20 worlds,8 locks,43 scene images,40 motion assets,163 jobs. RLS and protected
confirmation/trigger ACLs remain enforced. A later isolated QA project was added
through the real frontend; those earlier counts describe the release transaction.
No customer content, audio, approved worlds or assets were overwritten.

Functions: analyze-song v41, song-interpretation v2, AI Director v1, World v60,
Style v28. Generation v61 retains the existing production controller and deploys
the compatible Modal transport repair only. The full candidate Arena controller
is not released: candidate v60's read-only runtime preflight returned false for
Arena, verified transcription and interpretation-proposal prerequisites.
Do not describe the new preflight fields as still live after v61 restoration.
No financial attestations or secrets were changed.

Actual fresh-account login, upload, saved style/Notes and local DSP were tested.
Final isolated synthetic project: `ad266b2c-3e9b-45fb-b8ab-5aabacfe3ac4`.
The real frontend uploaded the original 16-second WAV, analyzed its signal and
persisted manual draft v1 with matching server SHA-256. Reload and Pixel 7 browser
emulation confirm persistence, audio playback, no page errors or overflow,
clear tempo/key estimate labels and disabled World continuation pending artist
confirmation. World route independently presents the confirmation gate.
Transcription was deliberately aborted before network; it is recorded failed.
No successful AI interpretation, creative confirmation or motion is claimed.
Physical Android browser testing remains unverified.

Production CI [39821652295](https://github.com/DaddyDom8249/BeatVision/actions/runs/39821652295)
PASS: 416/416 tests, zero skipped, audit/build PASS on exact frontend SHA.
Modal offline [39821652417](https://github.com/DaddyDom8249/BeatVision/actions/runs/39821652417)
PASS. Corrected-migration PostgreSQL run39818827550 PASS. Exact-head PG run
39821651802 reports every replay/security/lineage/quota/cleanup step successful;
its aggregate run status was still in_progress at retrieval and is not claimed
as completed. Earlier production dispatch39821481478 FAILED because the runner's
Chromium did not start within10s; the later same-SHA run passed without removing
checks. Browser harness selector failures and their corrections are recorded in
the checklist; a successful isolated test reused the same project/audio.

## External blockers

- Secure Supabase configuration access: connected tools can deploy functions and
  SQL but cannot edit secrets; CLI has no management token. Owner can bind the
  management token through secure environment settings or configure the dashboard.
  Never paste credentials in chat.
- Verify the actual Groq account plan/cost before enabling
  `GROQ_FREE_ACCOUNT_VERIFIED` or `BRAGORA_GROQ_FREE_VERIFIED`. Interpretation also
  requires `BRAGORA_INTERPRETATION_ENABLED`, the pinned approved model
  `openai/gpt-oss-20b` and bounded daily quota1–20. Runtime booleans establish
  incomplete prerequisites, not which individual secret is absent.
- Configure/review the existing Arena endpoint/token and exact
  `ARENA_GATEWAY_ALLOWED_HOSTS` before releasing the full candidate controller.
  Do not invent the hostname, change provider or disable validation.
- Artist must review and explicitly confirm their interpretation, World, Style
  Bible, characters, environments, story, storyboard and scene image. No agent
  approval or synthetic fixture is accepted as sponsor creative approval.
- User-supplied Modal screenshots now verify a configured **$0 spend limit** and
  **$42.50 usage limit including credits**, with $0.12 total usage. Modal states
  workloads stop after credits are exhausted and estimated charges exceed the
  spend limit; **Volume storage charges can still accrue**. This resolves the
  missing configured-spend-limit evidence. $42.38 is usage-cap headroom arithmetic,
  not a confirmed remaining credit balance. Credit expiry is not displayed.
  Current provider account/worker checks await the bridge-required phone approval
  for corrected read-only jobb23ccbf0. The previous check failed127 because its
  Debian-only path was invoked outside Debian; retry uses the known working
  proot-distro wrapper. Bridge retry succeeded and a phone preflight completed;
  heartbeat availability is intermittent. No direct credentials here. Exact worker/model
  availability and deployed revision remain unverified. See
  [screenshot observations](evidence/sponsor-demo-20261022/modal-user-financial-evidence.json).
  No inference or spending-setting change was performed.
- One bounded GPU job requires approved source image/instructions, financial
  proof and execution authorization. Never resubmit an uncertain job. Durable
  provider duplicate reconciliation is unverified. Then separately verify
  inference, persisted MP4, decode, duration, subject movement, source consistency
  and actual frontend playback. No job/output exists for this mission.

The transport fix rejects credential-bearing redirects, keeps the20-second
abort deadline through body read and caps JSON at16MiB while accepting an8MiB
clip envelope. It implements no provider spending cap.

## Full-song resources: configured workload, no cost quotation

Resource | Current source configuration / evidence limit
---|---
GPU | Modal L4; max1 container; min/buffer0
Model | Lightricks/LTX-Video-0.9.5; revision e58e28c39631af4d1468ee57a853764e11c1d37e
Short output | 704×480,49 frames at24fps (~2.04s),20 inference steps
Execution bound | 300-second timeout; automatic retries disabled
Media bound | 8MiB image /8MiB clip; private immutable Supabase media
Measured latency, spend, quality, memory | UNKNOWN: no authorized real proof job
Credits, price, expiry | Remaining compute credits/expiry/rates UNKNOWN; usage cap$42.50, usage$0.12 shown
Spend safeguard | $0 configured limit shown; workload-stop rule excludes Volume storage
Commercial model license suitability | Requires review before commercial production

240 seconds would require at least `ceil(240/(49/24))=118` accepted segments
before overlap, transitions, continuity and rejected variants. This arithmetic
is not full-song support or a funding quote. Funding must cover measured GPU
runtime/variants, creative/image inference quotas, durable media storage and
continuity/assembly validation. Actual dollars cannot be responsibly specified
until an authorized clip establishes runtime, output sizes and acceptance rate.

Full-length continuous subject motion, commercial quality, synchronized singing
and scalable concurrency remain planned/unverified. A truthful in-app funding
stopping point cannot be verified until genuine short-motion proof succeeds;
there is no claim of observed GPU exhaustion or an artificial success state.

## Test access

Open `/auth`, register an account you control, confirm its email and sign in.
Use a fresh project and your own song. The owner's isolated test account remains
email-confirmed; its generated password/session are private and omitted here.
Use the normal password-reset flow if independent access to that account is
needed. Do not share credentials or session tokens in chat or repository files.

Review the synthetic project only within its authorized account. Its draft has
not been confirmed. Existing project `a4841264-fac6-4ec9-ae07-04544493257c` later
received real user audio in another session; it and its transcript were
preserved. Screenshots containing that transcript remain private outside Git.
The public synthetic screenshots contain only clearly labeled technical text.

The immutable URL above is a deployed review build, not an accepted sponsor demo.
All mandatory creative/motion steps after intake remain BLOCKED.


## Follow-up: reported Edge request failure

User screenshot1000088094 reports failed transcription/interpretation transport
on the canonical theta origin. Read-only canonical frontend loads succeeded on
desktop and Pixel7 emulation, while an actual browser request with traceparent
reproduced CORS rejection on both handlers. Their old four-header allowlist did
not include current SDK tracing/retry headers. Exact screenshot header names
remain UNKNOWN; user-device retry confirmation is pending.

Commit2baa6a3041521a8646957b79cdedc50358ff420c updates only those two header
lists and regression tests; deployed interpretationv2/analyze-songv41 retain
all origin/auth/owner/provider-cost gates. Live traced canonical reads now pass,
unauthenticated requests still401, and deliberate empty analysis requests return
structured400 before inference. Production CI39828722358:418/418,0 skipped,
audit/build PASS. Frontend and schema unchanged. Details:
[cors-header-release.json](evidence/sponsor-demo-20261022/cors-header-release.json).

The immutable review host is separately missing from Edge origin allowlists;
that is deferred because the reported failing origin is canonical. Use the main
production URL for application checks. No genuine provider inference or creative
approval occurred during this repair. Modal read-only status checkb23ccbf0 remains
queued for the phone bridge's required approval after the corrected Debian wrapper;
no GPU submission was made.
