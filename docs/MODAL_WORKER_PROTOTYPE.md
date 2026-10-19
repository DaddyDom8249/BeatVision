# BragoraForge (BeatVision) — isolated private Modal LTX image-to-video worker

**Status: SOURCE IMPLEMENTED / LOCAL PRE-FLIGHT TESTED; REMOTE GPU / PRODUCTION NOT VERIFIED.**

The private Modal worker in `modal_workers/ltx_motion_worker.py` performs *real*, image-conditioned Diffusers inference on `Lightricks/LTX-Video-0.9.5` (2B model, non-distilled; deliberately selected for its documented `LTXConditionPipeline` entrypoint). It is not a mock-output generator. This does **not** replace the production Hugging Face adapter.

- Modal private SDK RPC only; **no public HTTP endpoint** and no arbitrary image URL requests.
- Uses JPEG/PNG **bytes** from an already owner-checked, approved BeatVision scene image, plus immutable project/scene/source-image/job IDs. It does not authenticate a browser user; that remains the BeatVision server/controller's responsibility.
- `L4` GPU (BF16), `max_containers=1`, five-minute execution timeout, near-immediate idle scaledown. One 41-frame, 24 fps, 704×512 experimental clip.
- No database, storage, approved media, creative decisions, final-video or production deployment modified.
- GPU function returns an MP4 to the authorized SDK caller. A separate owner-scoped ingestion step is REQUIRED to persist it durably and solicit creator approval. A request hash is **not** a durable deduplication lock; existing generation controller must retain that authority.
- Non-commercial or revenue restrictions in the checkpoint's weights license must be reviewed before selling generated output.

## Billing fail-closed requirement

Owner's Modal Starter screenshot showed $0 current usage, a **$1 total workspace usage cap** and no payment method. That is NOT evidence of $30 available GPU credits or a $0 out-of-pocket hard limit. **Do not deploy or run this worker until the selected workspace, GPU rate, remaining free credit, any automatic billing capability, commercial model permission, and hard spending cap have been independently verified and the owner authorizes the single run.**

A remote invocation requires:
1. Local caller explicitly provides `--acknowledge-spend`.
2. `BRAGORA_MODAL_GPU_ENABLED=YES` and `BRAGORA_MODAL_BILLING_CONFIRMED=YES` in the local caller environment.
3. Those same two flags stored in an owner-created Modal Secret called `bragora-modal-activation` scoped to this workspace, which the GPU container checks before loading the model.

**Important:** starting a GPU container can still charge compute before the container checks the flags. The flags do not replace an actual external billing limit.

## Verified offline checks (not a GPU proof)

```sh
python3 -m unittest discover -s scripts/test -p modal_ltx_worker_test.py -v
python3 -m py_compile modal_workers/ltx_motion_worker.py
```

Optional preflight with a real, owner-authorized local approved image:

```sh
python3 modal_workers/ltx_motion_worker.py --project-id '<uuid>' --scene-id '<uuid>' --source-image-id '<uuid>' --job-id '<uuid>' --prompt 'The subject turns their head in the rain' --image-path ./approved-scene.png
```

The preflight prints `preflight_only`, never a simulated MP4 URL.

**Future GPU proof only after cost authorization:** `modal run modal_workers/ltx_motion_worker.py --project-id '<uuid>' --scene-id '<uuid>' --source-image-id '<uuid>' --job-id '<uuid>' --prompt 'The subject turns their head in the rain' --image-path ./approved-scene.png --output-path ./prototype.mp4 --acknowledge-spend`.

Independent live acceptance: verify CUDA/model loading, frame decode and actual subject motion, cost, private durable upload, playback, asset lineage, creator approval, and integration into final assembly. All remain UNVERIFIED.

Sources: https://huggingface.co/docs/diffusers/api/pipelines/ltx_video ; https://huggingface.co/Lightricks/LTX-Video-0.9.5 ; https://modal.com/docs/guide/custom-container
