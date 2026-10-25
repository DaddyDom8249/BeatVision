# BragoraForge / BeatVision — isolated Modal motion proof

Status: **Modal integration exists; one authorized isolated trial generated visible subject motion and passed full decode/controlled frontend playback. Source continuity failed. The complete sponsor journey remains BLOCKED.** See the [authoritative checklist](../../docs/SPONSOR_DEMO_TODO.md) and [trial evidence](../../docs/evidence/sponsor-demo-20261022/modal-quality-trial-result.json).

The application selects Modal as primary and offers explicitly selected Hugging Face fallback. This worker uses Lightricks LTX Video **0.9.5 2B**, pinned at `e58e28c39631af4d1468ee57a853764e11c1d37e`. It generates 49 frames at 24 fps from image bytes, returning an MP4 and provenance whose approval flags remain false. Source ownership, approval and scene lineage must be established by the authenticated caller; supplied UUIDs do not establish them.

The isolated 2026-10-23 trial used a temporary 50-step/guidance-5 copy; repository defaults remain 20 steps/guidance 3 and no production worker upgrade was made. Its 2.041667-second clip has clear walking movement, but adds a background figure and loses detail. It remains unapproved. Playback used the actual bytes in the deployed component with controlled REST/signing fixtures on desktop and Pixel7 emulation; owner-storage/RLS lineage and physical Android are not established by that test.

## Zero-GPU verification

From repo root, run:

    python -m unittest discover -s providers/modal_motion/tests -v
    python -m py_compile providers/modal_motion/contracts.py providers/modal_motion/worker.py

Install the pinned CPU dependency first if absent: `python -m pip install Pillow==11.3.0`. These offline checks do not invoke a Modal worker or allocate GPU resources.

## Deployment/inference: financial and execution authorization required

For the completed single trial, the owner confirmed usable credits and a hard $0 paid-spend cap; the subsequent workspace billing read reports $0.00 billed. Numeric remaining credits and exact per-job cost were not retrieved. These observations do not authorize another invocation. Builds, startup, CPU, memory, transfer and GPU execution can consume credits. Verify current safeguards and explicit scope before further cloud execution.

1. Separately check authentic project owner, approved source image, source digest, and intended scene in Supabase. This CLI does NOT prove approval or ownership from IDs alone.
2. Authenticate Modal CLI locally, do not copy tokens to source/chat.
3. The verified local environment used Modal 1.6.2 and Pillow 11.3.0: `python -m pip install modal==1.6.2 Pillow==11.3.0`. Pillow is required for offline media tests and GPU image preparation. Media preparation is imported inside the GPU function so the separate FastAPI container can start without Pillow, torch or diffusers. After cloud execution is authorized, the existing CLI dry-run accepts real values:

    modal run providers/modal_motion/worker.py --image-path PATH --project-id UUID --scene-id UUID --source-image-id UUID --generation-job-id UUID --prompt "Describe actual subject movement"

The local entrypoint prints DRY_RUN_VALID without invoking the GPU, but `modal run` can initialize a cloud app/build images before that entrypoint. Use the offline checks above for non-billable verification. A real GPU call additionally requires `--execute`, exact acknowledgment `I_AUTHORIZE_ONE_MODAL_GPU_PROOF_WITHIN_MY_CONFIRMED_BUDGET` and local env `BRAGORA_MODAL_GPU_ENABLED=true`; these are not financial guarantees.

4. Record a durable attempt and call receipt, and poll only that call after uncertainty. The existing standalone CLI's output-file guard is not durable remote deduplication; do not rerun it merely because no MP4 was saved. Verify full decode, subject motion, source continuity, playback and explicit creator approval separately. The completed trial's scratch app is confirmed stopped; no further test is authorized by its receipt.

## Hard limits / verification

- 8 MiB input and output limits, PNG/JPEG signature and SHA256 check, UUID and prompt checks. Image is decoded and dimension-limited by Pillow remotely, then contained on an exact 704x480 RGB canvas so aspect ratio is preserved. The loaded LTX tokenizer bounds the final prompt to 128 tokens; character length alone is not treated as a token budget.
- Modal-authenticated Function with L4, max_containers=1, min_containers=0, buffer_containers=0, scaledown_window=2, 300s timeout, retries=0.
- The GPU function is private; the CPU HTTP bridge requires Modal proxy authentication. Credentials remain server-side. No automatic paid fallback or cron. The isolated trial made no application/customer-row writes or creative approvals.
- The isolated trial's dependency resolution, model execution, 49-frame decode, visible movement and full controlled frontend playback are verified. Continuity **FAILED**; strict facial identity and creator approval remain unverified. Workspace billing was $0.00; exact job cost and remaining credits are UNKNOWN.
- A container check alone does not prove motion. Production adapter/queue routing exists, but the fresh sequential sponsor journey, actual new-clip app persistence/lineage and full-song motion export are not verified by the isolated diagnostic.
- Commercial use of Lightricks model weights requires checking the actual non-Apache license.

References: https://modal.com/docs/sdk/py/latest/App , https://modal.com/pricing , https://huggingface.co/docs/diffusers/api/pipelines/ltx_video , https://huggingface.co/Lightricks/LTX-Video .

## Exact-snapshot loader repair (2026-10-19)

The initial proof branch pinned `Lightricks/LTX-Video` at `84631c2`, a legacy weights tree without `model_index.json`. A Diffusers `from_pretrained` call therefore could not boot from that snapshot. The worker now pins `Lightricks/LTX-Video-0.9.5` at `e58e28c39631af4d1468ee57a853764e11c1d37e`, whose tree includes `model_index.json`, text encoder, tokenizer, transformer and VAE. This fixes the source/model contract, **not** a remotely verified cold start, license compliance, GPU output, runtime cost or full-song export. Never launch without a separately verified no-overage billing policy.


## Bounded duration candidate (2026-10-24; not enabled in production)

The worker accepts an optional integer `frames`: 49 through 161 in steps of 8 (49, 57, …, 161), at 24 fps. Omission retains the existing 49-frame / 2.04-second request. The LTX 0.9.5 official model card demonstrates 161 frames; this does not verify our L4 runtime, quality, credits, or per-job cost. The existing 300-second timeout, 8 MiB media limit, single container, no retries, and creator review remain unchanged.

The backend defaults to 49 frames. Only after verifying the updated worker, remaining credits, account spending controls, and a bounded trial budget may the operator set `BRAGORA_MODAL_MAX_FRAMES` to an aligned limit up to 161. It selects enough frames for the approved source snapshot's scene duration, capped by that limit, and freezes the frame count and duration in each new job. Longer requests have distinct idempotency keys; legacy two-second requests retain their old key and wire payload. Lowering the operator cap blocks subsequent submission of longer queued jobs; it does not cancel already running GPU work.

The CLI accepts `--frames 121` (approximately 5.04 seconds) or `--frames 161` (approximately 6.71 seconds); retain dry-run mode until a specific execution budget is verified. No longer inference was performed during implementation.

Release order: update the authenticated Modal worker first, verify its contract without spawning GPU work, then deploy a minimal backend patch based on the currently deployed function rather than blindly replacing it with the candidate controller. Current production v66 differs in Arena configuration/transport and capability reporting. Keep the extended cap unset until the longer trial is authorized and credit-backed.

This does not combine multiple variants into a scene, revise approved plans, stretch/loop clips, or add lip sync. A 7.8-second scene still lacks coverage at the maximum 161/24-second clip length; assembly must continue to reject it. Full-song delivery needs an explicitly approved plan of shorter shots or a separately validated continuation/segment implementation, followed by actual decoded full-timeline playback and download verification.

Reference: https://huggingface.co/Lightricks/LTX-Video-0.9.5


## Five-second backend activation (2026-10-24)

The owner authorized activation after worker deployment and supplied the current billing/spend-limit screenshots. Generation controller v67 now includes the duration patch while preserving the deployed v66 Arena compatibility functions. The production adapter's environment reader defaults BRAGORA_MODAL_MAX_FRAMES to121 (approximately5.04s); explicitly set49 to restore proof-only length. Source snapshots and legacy requests still default missing frame metadata to49. Model execution remains20steps, timeout300s, maximum one container and no retries. No GPU trial has been run for this activation.

The exact patch from live v66 is recorded in releases/generation-v66-five-second.patch; it is not permission to replace live backend source from this branch blindly. Deployment readback matched all five submitted files byte-for-byte. Browser authentication is required for the approved-source trial.

The recorded release patch uses zero context; validate/apply it with git apply --unidiff-zero against the exact v66 baseline.


### API startup repair (2026-10-25)
Modal logs confirmed repeated missing-PIL startup failures in the separate CPU API image. Media preparation now imports only inside the GPU function. Reviewed worker8ddc75b was deployed; the identical worker module passed a real CPU-only Modal runtime/ASGI validation check in run40197208526. This verifies startup and malformed-request handling, not a successful authenticated render. The earlier shell check failed internally despite exit0; only the replacement runtime check is accepted. No new GPU inference was invoked.
