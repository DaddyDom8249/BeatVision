"""Single-proof Modal LTX image-to-video worker (NOT connected to production).

No public HTTP endpoint. Modal authentication is required to call the remote function.
No signed storage URLs, API keys, or private Supabase credentials are transmitted.
All image bytes originate from a locally supplied file and are bounded.

SAFETY: Deploying or running may consume chargeable Modal compute. NO invocation
is made during import, code inspection, compile, tests, or dry-run.
"""

from __future__ import annotations

import hashlib
import io
import os
from pathlib import Path

from providers.modal_motion.contracts import (
    ACKNOWLEDGEMENT, FPS, FRAMES, HEIGHT, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
    STEPS, WIDTH, MotionContractError, MotionRequest, manifest,
    manifest_json, require_execution_authorization, validate_request,
)

# Modal SDK is only needed when running "modal run" or deploying this file.
import modal

APP_NAME = 'bragoraforge-modal-motion-proof'
MODEL = 'Lightricks/LTX-Video'
# Pinned open-weights repository snapshot; must be checked against the license
# before any commercial/production deployment.
MODEL_REVISION = '84631c28b7e1641c029fe5d8d8e9b75c2735cb89'

app = modal.App(APP_NAME)
image = modal.Image.debian_slim(python_version='3.11').pip_install(
    'torch==2.7.1', 'diffusers==0.35.2', 'transformers==4.56.2',
    'accelerate==1.10.1', 'huggingface-hub==0.34.4',
    'safetensors==0.6.2', 'sentencepiece==0.2.1',
    'Pillow==11.3.0', 'imageio==2.37.0', 'imageio-ffmpeg==0.6.0',
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
    generator = torch.Generator(device='cpu').manual_seed(request.seed)
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
    result = single_motion_proof.remote(vars(request), image_bytes, acknowledgment)
    video = result['video']
    record = manifest(request, video, model=MODEL, revision=MODEL_REVISION)
    if record['video_sha256'] != result['manifest']['video_sha256']:
        raise MotionContractError('VIDEO_HASH_MISMATCH')
    dest.mkdir(parents=True, exist_ok=True)
    base = dest / request.generation_job_id
    # Never overwrite an existing clip on repeated runs.
    with (base.with_suffix('.mp4')).open('xb') as stream:
        stream.write(video)
    with (base.with_suffix('.json')).open('x', encoding='utf-8') as stream:
        stream.write(manifest_json(record))
    print(f'Unapproved proof clip stored at {base.with_suffix(".mp4")}')
