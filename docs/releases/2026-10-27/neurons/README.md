# Image-neuron protection — 2026-10-27

## Confirmed root cause

Production Cloudflare Worker `beatvision-provider-arena` routes BeatVision-tagged scene-image work directly to Workers AI `@cf/black-forest-labs/flux-1-schnell` (4 steps), regardless of Pixazo connectivity. The deployed entitlement flag only proves a free plan was verified; it does not reserve neurons or protect the shared daily allowance. Exact usage counts are not available through current Cloudflare billing permissions.

## Emergency safe stop

The Supabase `beatvision-generation` entrypoint blocks queued scene-image dispatch before claiming a job when server-side `BRAGORAFORGE_CLOUDFLARE_IMAGE_BUDGET_APPROVED` is **absent or not exactly `true`**. The explicit 503 code is `IMAGE_PROVIDER_BUDGET_DISABLED`. Existing approved images, saved progress, completed media, Modal motion, and final assembly are unaffected. No provider calls are used in validation.

The `live-v73-budget-guard.ts` file is a production-release candidate based on exact live v73, not the feature branch with unrelated modifications. Release by comparing live v73 and dependencies to archived source and deploying only this entrypoint with all existing support files, then verifying exact source and JWT readback.

**This protective gate must not be enabled** until there is a server-enforced, verified per-job image budget and an account-wide guard, or a tested alternate image provider with authorized zero-charge availability. No hidden Pixazo paid fallback. The app will temporarily refuse new image generation; this is preferable to quietly exhausting the quota. Existing image and motion batches must remain paused.

Next: add an explicit image-provider selector with a measured capacity ledger, idempotent scene reservations, no automatic retry on Cloudflare error 3036/429, and reuse of all approved compatible prior images. See GitHub Issue #160.
