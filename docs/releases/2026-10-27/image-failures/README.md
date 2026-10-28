# Scene-image failure classification

## Scope

Issue #160 follow-up on PR #161 (`4aeae58dbd97100bbbc90621d19023fae3d12b97`).
The live Arena Worker catches Workers AI exceptions and returns HTTP 502 with a
string error. The controller previously persisted that string and assigned generic
`ARENA_GENERATION_FAILED`, losing the distinction between neuron exhaustion and
capacity pressure, and potentially retaining private upstream details.

Only failed scene-image responses change. Known structured codes and the legacy
`AI_ERROR: 3036` / `AiError: 3040` wrappers become fixed, sanitized error categories.
3036 means quota exhaustion; 3040 means temporary capacity; an unidentified 429
means rate limiting with unknown quota. Unrecognized errors stay generic. Persisted
detail contains only provider/model, HTTP status and an optional known numeric code.
No upstream message, prompt, lyrics, private URL or image bytes enter this error.
The frontend maps those codes to beginner-readable recovery messages.

The existing durable queue already pauses a batch following a failed job and blocks
later scenes. Failed jobs are terminal and never resubmitted automatically. This
patch preserves those rules; it does not implement a new automatic retry/resume.
The early neuron budget gate is unchanged. No schema, settings, provider selection,
creative approvals, inference, batches or media are changed by this patch.

## Independently inspected checkpoint

- Git main: `3e26d8556e62b40e9f20823cb253854ae5efcec6`.
- PR #161: draft/open, head `4aeae58dbd97100bbbc90621d19023fae3d12b97`; Issue #160 open.
- Canonical frontend: READY `dpl_GkNnxxqEmD5SNjSQsR3bRpHqGLVo`, source `290e30c6c6250c59c0c1ee84126be68fd8974263`.
- Supabase generation: ACTIVE v74, bundle `971fdf51bb837ccbdf2f014407b83de7e5bca2b145f62ecaa985c7d55cc7abf2`, `verify_jwt=false` with explicit in-function authentication.
- Actual v74 entrypoint byte-matches the prior `neurons/beatvision-generation/live-v73-budget-guard.ts` release file (despite its historical filename).
- All five retrieved supporting files byte-match current feature helpers.
- Arena content/v2: BeatVision still calls Workers AI FLUX Schnell directly, four steps. No Worker edits.
- Four AI-bound Workers: `beatvision-image-provider-test`, `beatvision-production`, `beatvision-provider-arena`, `cloudflare-ai-worker`. Binding presence is not a usage measurement.
- Glass Love image and motion batches both paused. Latest approved revision 6 has 57 scenes, no current approved images, and 57 unfilled scenes with compatible approved ancestor images according to the actual `can_reuse_scene_image` function. No reuse or approval performed.
- Connected HF identity is the founder's non-Pro account. Model metadata lists FLUX.1-schnell as gated and Apache-2.0. Identity/model metadata does not prove download permission, available credits, a dedicated GPU, or capacity for 60 images.
- No verified replacement image budget/GPU. Runtime budget-flag value and current account-wide neuron usage remain unknown.

## Reproducible release and rollback

Run `node scripts/build-image-failure-release.mjs`. This creates
`live-v74-image-failures.ts` from the byte-exact v74 archive, transplanting only the
classifier, sanitized-code allowlist and failed-image dispatch branch. Never deploy
the full feature controller: its unrelated Arena security/configuration differences
remain unreconciled. The historical snapshots are immutable.

Test the actual release candidate with:

```
BRAGORA_IMAGE_FAILURE_SOURCE=docs/releases/2026-10-27/image-failures/live-v74-image-failures.ts node --test scripts/test/image-provider-failures.test.mjs
```

Before deployment re-fetch live generation and compare all six files and JWT setting
to v74. Deploy only this candidate with the same five live helper files. Read back
all six and compare byte-for-byte. Keep the existing budget gate/configuration and
paused batches. No inference may be submitted as a release test.

Rollback, if needed: deploy the archived exact v74 entrypoint with the same five
helpers and unchanged JWT setting, then read back. This retains the neuron and batch
dispatch guards. Rollback does not modify jobs, assets or creative state.

## Remaining work

Atomic server-owned capacity reservations, explicit approved provider choice,
pre-enqueue capacity estimates, provider-wide exhaustion circuit breaking and a
verified dedicated image worker are still unfinished. This narrow diagnostic repair
cannot guarantee account-wide Cloudflare quota or enable a 60-image free render.
Real owner-authenticated failure/recovery, new image output and song-to-MP4 remain
unverified. Do not enable the budget flag based on these tests.

References: [Cloudflare errors](https://developers.cloudflare.com/workers-ai/platform/errors/),
[pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
[model metadata](https://huggingface.co/black-forest-labs/FLUX.1-schnell).
