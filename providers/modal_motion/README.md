# BragoraForge / BeatVision — isolated Modal motion proof

Status: **SOURCE PROTOTYPE ONLY; UNDEPLOYED; NO MODAL GPU CALL VERIFIED.**

This manual, opt-in image-to-video worker leaves the production Hugging Face route, approved images, Supabase generation queues and frontend unchanged. Model: Lightricks LTX Video **0.9.5 2B**, at pinned commit `e58e28c39631af4d1468ee57a853764e11c1d37e` (not the 13B production model). It generates 49 frames at 24 fps (~2 seconds) from a locally supplied approved image, returning a private local MP4 and provenance JSON whose approval flags remain false.

## Zero-GPU verification

From repo root, run:

    python -m unittest discover -s providers/modal_motion/tests -v
    python -m py_compile providers/modal_motion/contracts.py providers/modal_motion/worker.py

These do not import or call a real Modal worker or use GPU resources.

## Deployment/inference: BLOCKED pending cost and identity verification

Modal account screenshot confirms workspace `beatvision` Starter and a $1 usage limit with $0 spent, but does NOT confirm spendable $30 credit or a $0 out-of-pocket cap. A deployment/build or GPU cold boot can consume resources. Do NOT deploy or invoke the function without verifying actual credits, rate/limits and explicit owner authorization for any unknown spend.

1. Separately check authentic project owner, approved source image, source digest, and intended scene in Supabase. This CLI does NOT prove approval or ownership from IDs alone.
2. Authenticate Modal CLI locally, do not copy tokens to source/chat.
3. Install an up-to-date Modal SDK locally. Then from repo root run the *dry-run* with real values:

    modal run providers/modal_motion/worker.py --image-path PATH --project-id UUID --scene-id UUID --source-image-id UUID --generation-job-id UUID --prompt "Describe actual subject movement"

The local entrypoint prints DRY_RUN_VALID without invoking the GPU. A real GPU call requires the separate `--execute` flag, exact acknowledgment `I_AUTHORIZE_ONE_MODAL_GPU_PROOF_WITHIN_MY_CONFIRMED_BUDGET` and local env `BRAGORA_MODAL_GPU_ENABLED=true`. Those gates are not a financial guarantee.

4. After the user authorizes a bounded cost, prove the first GPU cold start and a real 2-second clip. Do not retry ambiguous invocations; job ID is *not* remote-side deduplication. Verify full MP4 decode, multiple frames and actual movement, private playback, and creator approval before considering production integration.

## Hard limits / verification

- 8 MiB input and output limits, PNG/JPEG signature and SHA256 check, UUID and prompt checks. Image is decoded and dimension-limited by Pillow remotely.
- Modal-authenticated Function with L4, max_containers=1, min_containers=0, buffer_containers=0, scaledown_window=2, 300s timeout, retries=0.
- No public HTTP endpoint, no paid fallback, no automatic cron, no production database writes, no approved-asset mutation.
- Source checks **PASS** locally; real Modal dependency resolution, image boot, GPU memory/latency, cost, generated motion, full-song export and browser playback remain **UNVERIFIED**.
- Output MP4 container check is minimal, NOT proof of actual subject motion. No production adapter/queue routing exists yet.
- Commercial use of Lightricks model weights requires checking the actual non-Apache license.

References: https://modal.com/docs/sdk/py/latest/App , https://modal.com/pricing , https://huggingface.co/docs/diffusers/api/pipelines/ltx_video , https://huggingface.co/Lightricks/LTX-Video .

## Exact-snapshot loader repair (2026-10-19)

The initial proof branch pinned `Lightricks/LTX-Video` at `84631c2`, a legacy weights tree without `model_index.json`. A Diffusers `from_pretrained` call therefore could not boot from that snapshot. The worker now pins `Lightricks/LTX-Video-0.9.5` at `e58e28c39631af4d1468ee57a853764e11c1d37e`, whose tree includes `model_index.json`, text encoder, tokenizer, transformer and VAE. This fixes the source/model contract, **not** a remotely verified cold start, license compliance, GPU output, runtime cost or full-song export. Never launch without a separately verified no-overage billing policy.
