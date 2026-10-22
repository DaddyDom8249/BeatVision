# Sponsor demo release and remaining gates

The authorized software release is live at https://beat-vision-theta.vercel.app/.
The full sponsor demo remains BLOCKED. The authoritative record is
[SPONSOR_DEMO_TODO.md](SPONSOR_DEMO_TODO.md).

## Released and verified

Frontend: `64e6edf35a6de2b3da3db63d4ac6be6f19ca7f52`, Vercel
`dpl_4tzfmck36NYpFTn3xbhzQYhcx8Ft`, READY with the original production alias.
Immutable release URL: https://beat-vision-nlxq3v0z6-beat-vision.vercel.app/.
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
- Owner confirmed the dedicated Groq Free/no-paid-billing account. That evidence
  is owner attestation; no independent billing retrieval is claimed. Actual
  server503 PROVIDER_COST_UNVERIFIED still rejects required configuration.
  Setting values remain UNKNOWN; at least one required condition fails. Interpretation also
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
  Approved corrected phone checkb23ccbf0 completed exit0: the exact existing
  Modal app is deployed with0 tasks; function backlog/running inputs/runners are0.
  Current billing summary shows metered$0.16, applied credits-$0.12 and billed$0.00
  after the egress allowance. This verifies authenticated control-plane access
  and idle function registration. It does not verify loaded model/GPU capacity,
  remaining credits, expiry or a generated artifact. The old127 path failure was
  corrected using the existing Debian wrapper; do not report its approval as pending.
  See [current control-plane evidence](evidence/sponsor-demo-20261022/modal-control-plane-verified.json).
  Direct account credentials remain absent from the workspace. See
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


## Approved Modal check and next provider-setup dependency

The read-only Modal command completed successfully through Termux. No GPU job
was submitted. T09 has fresh app/account/statistics/ledger evidence; actual model
runtime, approved scene/image/instructions and full inference acceptance remain
unverified. The next independent T04 check is existing Supabase CLI access in
that same Debian environment. Grouped job900e072e-70d0-4005-acfe-b061779596c1 (prior badbf87f completed, but CLI help failed on Android Node)
runs help and a read-only secret-name presence query; no secret values/digests,
login prompt, install, settings update or inference. It requires the bridge's
per-command phone approval. Application source/deployments/tests unchanged.


User prefers consolidated phone approvals. The current single read-only batch
covers existing Linux-runtime selection, CLI secret-name metadata and canonical
post-patch CORS checks; no install/login/settings/inference. Pending approval for
900e072e replaces the completed probe, not another execution of that same job.


## Approved grouped diagnostics result

Batch900e072e completed: both physical-phone network preflights return200 for
the canonical origin with no missing SDK headers after the patch. This is not
a real browser interpretation proposal, artist approval or video playback test.
CLI management read did not run: only two standard Linux Node locations were
checked and absent. Existing successful command metadata identifies
/root/.local/node-v22.16.0-linux-arm64/bin/node. Final targeted retrye8641d25
(attempt3/3) uses that known candidate and one batch for all nine configuration
names; it requires a new bridge phone approval. No install/login/secret-value
inspection, settings or inference. Do not repeat completed CORS/billing tests.


## One operator setup pass after the final CLI result

Final approved jobe8641d25 proves Linux Nodev22.16.0 works, but the installed
Supabase JS wrapper lacks its linux-arm64 CLI binary. CLI help failed locally;
management authentication and secret metadata never ran. Three attempts are
exhausted, so no further phone CLI request is queued. This is not an RLS or
backend failure. See
[final CLI evidence](evidence/sponsor-demo-20261022/supabase-cli-final-result.json).

The next setup can use the existing
[Supabase Edge Function secrets dashboard](https://supabase.com/dashboard/project/mdofsinyofqbeapzfygu/functions/secrets)
in one session. Supabase's current
[secrets documentation](https://supabase.com/docs/guides/functions/secrets)
confirms multiple secrets can be pasted at once and become available without
redeploying the functions. Current individual values/presence remain UNKNOWN.

The owner has now confirmed that the dedicated **Groq** account is Free with
paid billing disabled. This is owner attestation, recorded separately from
Modal billing. Do not ask for the same confirmation again. The actual frontend
provider gate still returns503; the prepared non-secret settings are:

```dotenv
GROQ_FREE_ACCOUNT_VERIFIED=true
BRAGORA_GROQ_FREE_VERIFIED=true
BRAGORA_INTERPRETATION_ENABLED=true
BRAGORA_AI_DIRECTOR_ENABLED=true
BRAGORA_GROQ_MODEL=openai/gpt-oss-20b
BRAGORA_AI_DAILY_QUOTA=3
```

These values are a prepared setup batch, **not** changes already made or proof
that the provider is free. The quota3 is a conservative recommended setting
within source-enforced1–20 for interpretation/Director operations; it is not an
account-wide cap on transcription/World/Style requests. Keep the existing
`GROQ_FREE_API_KEY` if it belongs to that verified dedicated account; otherwise
enter the correct dedicated key only through the Dashboard/secure environment.
Do not paste a placeholder over an existing key or send credentials in chat.
The same verified-free account flag gates transcription, World and Style text.
Do not add unrelated provider keys or paid fallbacks.

For the existing Arena connection, review these together before releasing the
full candidate generation controller:

Setting | Required existing/verified value
---|---
ARENA_GATEWAY_URL | Existing approved HTTPS origin only; no path/query/fragment/credentials/port
ARENA_GATEWAY_TOKEN | Existing valid gateway token entered/reused securely
ARENA_GATEWAY_ALLOWED_HOSTS | Exact lowercase DNS hostname from that verified origin; no wildcard

No endpoint or token value is guessed or included here. Verify the existing
image provider's no-charge eligibility before any scene-image submission; Modal
credits do not establish another provider's price. Preserve the compatible
production generation controller until its candidate prerequisites are verified.

Alternative: bind working `SUPABASE_ACCESS_TOKEN` through secure environment
settings so the existing workspace CLI can apply the reviewed configuration.
Supply any missing dedicated provider key through that secure mechanism too,
never in chat. No need to repair the phone CLI to use the Dashboard route.
After setup application, verify authenticated provider availability,
then proceed to genuine analysis/interpretation and artist review. No creative
content is auto-approved. A GPU proof still requires approved scene inputs and
bounded execution safeguards; the complete sponsor demo remains BLOCKED.


## Interpretation error repair verified on production

Commit64e6edf35a6de2b3da3db63d4ac6be6f19ca7f52 corrects the hook discarding
HTTP error Response JSON. Actual canonical frontend now displays the server's
PROVIDER_COST_UNVERIFIED message and manual-edit availability. Desktop/Pixel7
controlled-response checks verify the UI correction; a separate real frontend
request confirms the live configuration blocker. Prior manualv1 remains intact,
Continue remains disabled, no content approved and no GPU request submitted.
[Release evidence](evidence/sponsor-demo-20261022/interpretation-error-release.json)
records exact deployment and CI39849524379:422/422 PASS,0 skipped,audit/build PASS.
The complete sponsor journey remains BLOCKED until the prepared existing-project
settings are applied using secure access and the artist performs creative review.


## Owner reports settings saved — current result

The owner reports the setup was saved. One actual canonical frontend retest at
2026-10-22T20:40:20Z still returns503 PROVIDER_COST_UNVERIFIED; see
[actual result](evidence/sponsor-demo-20261022/groq-configured-proposal-result.json).
This fails before provider access: at least one verified flag, enable flag,
nonempty dedicated key or exact pinned model is missing/mismatched. Individual
values remain UNKNOWN. No new proposal/draft, provider success or GPU proof is
claimed. Configuration submission approach is closed3/3; no automatic retry.
The current non-secret clarification is whether GROQ_FREE_API_KEY exists in the
same project, separately from the six pasted settings. Existing correct keys
must be retained; no key value should be sent in chat. The owner-confirmed
Free/no-paid-billing account attestation is not being requested again.
