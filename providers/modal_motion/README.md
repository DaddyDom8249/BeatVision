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
3. The verified local environment used Modal 1.6.2 and Pillow 11.3.0: `python -m pip install modal==1.6.2 Pillow==11.3.0`. Pillow is needed locally because `media.py` imports it when the worker module loads. The initial trial preflight failed before GPU submission until this dependency was installed. After cloud execution is authorized, the existing CLI dry-run accepts real values:

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
