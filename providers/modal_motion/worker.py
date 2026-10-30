"""Single-proof Modal LTX image-to-video worker (NOT connected to production).

The GPU function remains private. A proxy-authenticated HTTP bridge submits and
polls durable calls from the server-side generation controller. No browser receives
Modal credentials, signed storage URLs, API keys, or private Supabase credentials.
All image bytes originate from a locally supplied file and are bounded.

SAFETY: Deploying or running may consume chargeable Modal compute. NO invocation
is made during import, code inspection, compile, tests, or dry-run.
"""

from __future__ import annotations

import hashlib
import uuid
import io
import json
import os
import re
from pathlib import Path

from providers.modal_motion.contracts import (
    ACKNOWLEDGEMENT, FPS, FRAMES, HEIGHT, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
    STEPS, WIDTH, MotionContractError, MotionRequest, manifest,
    manifest_json, require_execution_authorization, validate_request,
)

# Modal SDK is only needed when running "modal run" or deploying this file.
import modal

APP_NAME = 'bragoraforge-modal-motion-proof'
MODEL = 'Lightricks/LTX-Video-0.9.5'
# Full, source-verified Diffusers image-to-video snapshot (model_index.json,
# transformer, text encoder and VAE). The older LTX-Video SHA omitted model_index.
# Model weights have a separate license; commercial terms must be reviewed.
MODEL_REVISION = 'e58e28c39631af4d1468ee57a853764e11c1d37e'

app = modal.App(APP_NAME)
image = modal.Image.debian_slim(python_version='3.11').pip_install(
    'torch==2.7.1', 'diffusers==0.35.2', 'transformers==4.56.2',
    'accelerate==1.10.1', 'huggingface-hub==0.34.4',
    'safetensors==0.6.2', 'sentencepiece==0.2.1',
    'Pillow==11.3.0', 'imageio==2.37.0', 'imageio-ffmpeg==0.6.0',
).add_local_python_source('providers.modal_motion')
web_image = modal.Image.debian_slim(python_version='3.11').pip_install(
    'fastapi[standard]==0.139.2',
).add_local_python_source('providers.modal_motion')


@app.function(
    image=image,
    gpu='L4',
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=2,
    timeout=300,
    retries=0,
    name='single_motion_proof',
)
def single_motion_proof(payload: dict, image_bytes: bytes, ack: str) -> dict:
    """One bounded 49-frame model inference; no external public endpoint.

    The caller must already have authenticated through Modal and must separately
    establish source ownership/approval from the application database. This
    isolated function deliberately makes NO claims that user-supplied IDs prove
    ownership or approval. Output remains UNAPPROVED until creator review.
    """
    # Remote workers do not inherit the caller's local env. Require an explicit
    # per-invocation acknowledgement; the local CLI separately checks the env.
    require_execution_authorization(ack, 'true')
    request = MotionRequest(**payload)
    validate_request(request, image_bytes)
    # The execution can outlive its submitting container. Publish its own
    # provider identity BEFORE model loading/inference, independently of spawn's
    # reply. A write refusal fails closed; it never authorizes another spawn.
    _publish_execution_receipt(payload)

    # Import large dependencies inside the remote function; zero GPU allocated
    # until this function is invoked by an authenticated Modal client.
    import tempfile
    import torch
    from PIL import Image, UnidentifiedImageError
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video

    Image.MAX_IMAGE_PIXELS = 12_000_000
    try:
        with Image.open(io.BytesIO(image_bytes)) as opened:
            opened.verify()
        with Image.open(io.BytesIO(image_bytes)) as opened:
            if opened.width * opened.height > 12_000_000:
                raise MotionContractError('IMAGE_DIMENSIONS_INVALID')
            source = opened.convert('RGB')
            source.thumbnail((WIDTH, HEIGHT))
    except (OSError, UnidentifiedImageError, ValueError) as exc:
        raise MotionContractError('IMAGE_DECODE_FAILED') from exc

    # CPU offloading reduces VRAM needs. Initial model download/boot is NOT
    # proven to fit 300 seconds or a $1 usage limit; this is gated research.
    pipeline = LTXImageToVideoPipeline.from_pretrained(
        MODEL, revision=MODEL_REVISION, torch_dtype=torch.bfloat16
    )
    pipeline.enable_model_cpu_offload()
    pipeline.vae.enable_tiling()
    # Diffusers creates latent noise on CUDA; the generator must match that device.
    generator = torch.Generator(device='cuda').manual_seed(request.seed)
    output = pipeline(
        image=source, prompt=request.prompt,
        negative_prompt='worst quality, jittery, distorted, static image',
        width=WIDTH, height=HEIGHT, num_frames=FRAMES,
        num_inference_steps=STEPS, guidance_scale=3.0,
        generator=generator,
    ).frames[0]

    with tempfile.TemporaryDirectory() as tempdir:
        video_path = Path(tempdir) / 'proof.mp4'
        export_to_video(output, str(video_path), fps=FPS)
        if video_path.stat().st_size > MAX_VIDEO_BYTES:
            raise MotionContractError('VIDEO_BYTES_INVALID')
        video_bytes = video_path.read_bytes()
    record = manifest(request, video_bytes, model=MODEL, revision=MODEL_REVISION)
    # A container signature alone does NOT prove decoded motion or successful
    # browser playback. These must be checked separately before acceptance.
    return {'manifest': record, 'video': video_bytes}


def _submission_receipts():
    return modal.Dict.from_name('bragoraforge-modal-submissions-v1', create_if_missing=True)


def _request_fingerprint(payload: dict):
    normalized = {**payload, 'generation_job_id': str(uuid.UUID(payload['generation_job_id']))}
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _publish_execution_receipt(payload: dict):
    """Recover a lost caller reply once the reserved execution actually starts.

    This does not make reservation/spawn atomic. Dict retention is finite (the
    documented new-Dict default is seven inactive days); no permanent replay
    guarantee or safe replacement of an unknown execution is implied.
    """
    key = str(uuid.UUID(payload['generation_job_id']))
    fingerprint = _request_fingerprint(payload)
    call_id = modal.current_function_call_id()
    if not isinstance(call_id, str) or not re.fullmatch(r'fc-[A-Za-z0-9_-]+', call_id):
        raise MotionContractError('MODAL_JOB_RECEIPT_INVALID')
    receipts = _submission_receipts()
    existing = receipts.get(key)
    if not isinstance(existing, dict) or existing.get('fingerprint') != fingerprint:
        raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
    if existing.get('job_id') not in (None, call_id):
        raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
    execution = {'fingerprint': fingerprint, 'state': 'accepted', 'job_id': call_id}
    # Fence competing executions and same-call re-entry before model loading.
    # The immutable claim itself contains the receipt, so interruption of the
    # following convenience update cannot hide an already admitted call.
    if not receipts.put('execution:' + key, execution, skip_if_exists=True):
        raise MotionContractError('MODAL_EXECUTION_ALREADY_ADMITTED')
    receipts.put(key, execution)


def _submission_receipt(receipts, generation_job_id: str, fingerprint=None):
    key = str(uuid.UUID(generation_job_id))
    existing = receipts.get(key)
    execution = receipts.get('execution:' + key)
    if not isinstance(existing, dict) and isinstance(execution, dict):
        existing = {'fingerprint': execution.get('fingerprint')}
    if fingerprint is not None and (
        not isinstance(existing, dict) or existing.get('fingerprint') != fingerprint
    ):
        raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
    if not isinstance(existing, dict):
        return {'status': 'not_found', 'receipt_known': False}
    if not isinstance(existing.get('fingerprint'), str) or not re.fullmatch(r'[0-9a-f]{64}', existing['fingerprint']):
        raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
    receipt = existing.get('job_id')
    if execution is not None:
        if not isinstance(execution, dict) or execution.get('fingerprint') != existing.get('fingerprint'):
            raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
        execution_id = execution.get('job_id')
        if not isinstance(execution_id, str) or not re.fullmatch(r'fc-[A-Za-z0-9_-]+', execution_id):
            raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
        if receipt is not None and receipt != execution_id:
            raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
        receipt = execution_id
    if isinstance(receipt, str) and re.fullmatch(r'fc-[A-Za-z0-9_-]+', receipt):
        return {'status': 'processing', 'job_id': receipt}
    return {'status': 'reconciliation_required', 'receipt_known': False}


def _reserve_motion(payload: dict, source: bytes, ack: str):
    """Shared CLI/HTTP admission. An uncertain reservation is never reclaimed.

    This contains duplicates while the durable reservation exists; reservation,
    provider acceptance and receipt persistence are still separate operations.
    """
    require_execution_authorization(ack, 'true')
    validated = MotionRequest(**payload)
    validate_request(validated, source)
    key = str(uuid.UUID(validated.generation_job_id))
    payload = {**payload, 'generation_job_id': key}
    fingerprint = _request_fingerprint(payload)
    receipts = _submission_receipts()
    reservation = {'fingerprint': fingerprint, 'state': 'receipt_unknown'}
    if not receipts.put(key, reservation, skip_if_exists=True):
        return _submission_receipt(receipts, key, fingerprint)
    # The convenience parent entry may expire before a still-live execution
    # claim. Consult that claim BEFORE spawning, including after parent loss.
    retained = _submission_receipt(receipts, key, fingerprint)
    if retained.get('job_id'):
        return retained
    # A crash before/after spawn or during receipt persistence leaves the hold
    # intact. Neither entry point may infer that another execution is safe.
    call = single_motion_proof.spawn(payload, source, ack)
    if not re.fullmatch(r'fc-[A-Za-z0-9_-]+', call.object_id):
        raise MotionContractError('MODAL_JOB_RECEIPT_INVALID')
    observed = _submission_receipt(receipts, key, fingerprint)
    if observed.get('job_id') not in (None, call.object_id):
        raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
    receipts.put(key, {'fingerprint': fingerprint, 'state': 'accepted', 'job_id': call.object_id})
    return {'status': 'processing', 'job_id': call.object_id}


@app.function(
    image=web_image,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=2,
    timeout=30,
    name='motion_api',
)
@modal.asgi_app(requires_proxy_auth=True)
def motion_api():
    """Proxy-authenticated submit/poll bridge; only the spawned call uses a GPU."""
    import base64
    import binascii
    import re

    # FastAPI resolves postponed annotations against module globals. Keep the
    # runtime-only import visible so `request: fastapi.Request` is not a query field.
    global fastapi
    import fastapi
    from fastapi.responses import JSONResponse

    web = fastapi.FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    @web.post('/submit')
    async def submit(request: fastapi.Request):
        try:
            body = await request.json()
            if not isinstance(body, dict):
                raise MotionContractError('HTTP_BODY_INVALID')
            payload = body.get('payload')
            encoded = body.get('image_base64')
            ack = body.get('ack')
            if not isinstance(payload, dict) or not isinstance(encoded, str):
                raise MotionContractError('HTTP_BODY_INVALID')
            if len(encoded) > ((MAX_IMAGE_BYTES + 2) // 3) * 4:
                raise MotionContractError('IMAGE_BYTES_INVALID')
            try:
                source = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error) as exc:
                raise MotionContractError('IMAGE_BASE64_INVALID') from exc
            submission = _reserve_motion(payload, source, ack)
            if submission['status'] == 'reconciliation_required':
                return JSONResponse({'status': 'reconciliation_required', 'receipt_known': False}, status_code=202)
            return submission
        except MotionContractError as exc:
            status = 409 if str(exc) in ('MODAL_REQUEST_FINGERPRINT_CONFLICT', 'MODAL_EXECUTION_RECEIPT_CONFLICT') else 400
            return JSONResponse({'error': str(exc)}, status_code=status)
        except (TypeError, ValueError) as exc:
            return JSONResponse({'error': str(exc)}, status_code=400)

    @web.get('/receipt/{generation_job_id}')
    async def receipt(generation_job_id: str):
        try:
            generation_job_id = str(uuid.UUID(generation_job_id))
        except (ValueError, AttributeError):
            return JSONResponse({'error': 'MODAL_REQUEST_ID_INVALID'}, status_code=400)
        try:
            submission = _submission_receipt(_submission_receipts(), generation_job_id)
        except MotionContractError as exc:
            return JSONResponse({'error': str(exc)}, status_code=409)
        if submission['status'] == 'not_found':
            return JSONResponse({'status': 'not_found', 'receipt_known': False}, status_code=404)
        if submission['status'] == 'processing':
            return submission
        return JSONResponse({'status': 'reconciliation_required', 'receipt_known': False}, status_code=202)

    @web.get('/poll/{call_id}')
    async def poll(call_id: str):
        if not re.fullmatch(r'fc-[A-Za-z0-9_-]+', call_id):
            return JSONResponse({'error': 'MODAL_JOB_ID_INVALID'}, status_code=400)
        call = modal.FunctionCall.from_id(call_id)
        try:
            result = call.get(timeout=0)
        except TimeoutError:
            return JSONResponse({'status': 'processing'}, status_code=202)
        video = result.get('video') if isinstance(result, dict) else None
        record = result.get('manifest') if isinstance(result, dict) else None
        if not isinstance(video, bytes) or not 16 <= len(video) <= MAX_VIDEO_BYTES:
            return JSONResponse({'error': 'MODAL_MEDIA_SIZE_INVALID'}, status_code=502)
        if not isinstance(record, dict):
            return JSONResponse({'error': 'MODAL_MANIFEST_MISSING'}, status_code=502)
        return {
            'status': 'completed',
            'video_base64': base64.b64encode(video).decode('ascii'),
            'manifest': record,
        }

    return web


@app.local_entrypoint()
def main(
    image_path: str,
    project_id: str,
    scene_id: str,
    source_image_id: str,
    generation_job_id: str,
    prompt: str,
    seed: int = 42,
    output_dir: str = './modal-motion-proof',
    acknowledgment: str = '',
    execute: bool = False,
):
    """Dry-run by default; --execute additionally requires local env + full ack.

    Neither --execute nor the acknowledge string is financial proof. Verify
    workspace cap AND residual credits BEFORE invoking remotely.
    """
    path = Path(image_path)
    if not path.is_file() or path.stat().st_size > MAX_IMAGE_BYTES:
        raise MotionContractError('IMAGE_BYTES_INVALID')
    image_bytes = path.read_bytes()
    request = MotionRequest(
        project_id=project_id, scene_id=scene_id,
        source_image_id=source_image_id,
        generation_job_id=generation_job_id,
        image_sha256=hashlib.sha256(image_bytes).hexdigest(),
        prompt=prompt, seed=seed,
    )
    validate_request(request, image_bytes)
    if not execute:
        print('DRY_RUN_VALID: 0 GPU calls; approved source/ownership must be checked independently')
        return
    require_execution_authorization(acknowledgment, os.environ.get('BRAGORA_MODAL_GPU_ENABLED', ''))
    dest = Path(output_dir).resolve()
    if dest.exists() and any(dest.glob(f'{request.generation_job_id}.*')):
        raise MotionContractError('JOB_ALREADY_HAS_LOCAL_OUTPUT')
    submission = _reserve_motion(vars(request), image_bytes, acknowledgment)
    if submission['status'] != 'processing':
        raise MotionContractError('MODAL_SUBMISSION_RECONCILIATION_REQUIRED')
    result = modal.FunctionCall.from_id(submission['job_id']).get(timeout=300)
    video = result['video']
    record = manifest(request, video, model=MODEL, revision=MODEL_REVISION)
    if record['video_sha256'] != result['manifest']['video_sha256']:
        raise MotionContractError('VIDEO_HASH_MISMATCH')
    if any(result['manifest'].get(key) != value for key, value in record.items()):
        raise MotionContractError('MODAL_RESULT_PROVENANCE_INVALID')
    dest.mkdir(parents=True, exist_ok=True)
    base = dest / request.generation_job_id
    # Never overwrite an existing clip on repeated runs.
    with (base.with_suffix('.mp4')).open('xb') as stream:
        stream.write(video)
    with (base.with_suffix('.json')).open('x', encoding='utf-8') as stream:
        stream.write(manifest_json(record))
    print(f'Unapproved proof clip stored at {base.with_suffix(".mp4")}')
