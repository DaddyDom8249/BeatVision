"""Pure, dependency-free Modal proof request validation.

Only an authenticated application backend may assert that the source image is approved.
This module checks integrity and resource bounds, NOT project ownership or approval.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import uuid
from dataclasses import dataclass

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_VIDEO_BYTES = 8 * 1024 * 1024
MAX_PROMPT_CHARS = 1600
WIDTH = 704
HEIGHT = 480
FRAMES = 49  # ~2 seconds at 24 fps; this is a proof clip, not a full-scene output.
FPS = 24
STEPS = 20
SEED_MIN = 1
SEED_MAX = 2_147_483_646
ACKNOWLEDGEMENT = 'I_AUTHORIZE_ONE_MODAL_GPU_PROOF_WITHIN_MY_CONFIRMED_BUDGET'
_SHA256 = re.compile(r'^[0-9a-f]{64}$')


class MotionContractError(ValueError):
    """Safe, content-free validation error."""


@dataclass(frozen=True)
class MotionRequest:
    project_id: str
    scene_id: str
    source_image_id: str
    generation_job_id: str
    image_sha256: str
    prompt: str
    seed: int


def _uuid(value: str, field: str) -> str:
    try:
        value = str(uuid.UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise MotionContractError(f'{field}_INVALID') from exc
    return value


def validate_request(request: MotionRequest, image: bytes) -> MotionRequest:
    if not isinstance(image, bytes) or not 16 <= len(image) <= MAX_IMAGE_BYTES:
        raise MotionContractError('IMAGE_BYTES_INVALID')
    if not (image.startswith(b'\x89PNG\r\n\x1a\n') or image.startswith(b'\xff\xd8\xff')):
        raise MotionContractError('IMAGE_TYPE_INVALID')
    if not _SHA256.fullmatch(request.image_sha256):
        raise MotionContractError('IMAGE_HASH_INVALID')
    if not hmac.compare_digest(hashlib.sha256(image).hexdigest(), request.image_sha256):
        raise MotionContractError('IMAGE_HASH_MISMATCH')
    for field in ('project_id', 'scene_id', 'source_image_id', 'generation_job_id'):
        _uuid(getattr(request, field), field.upper())
    if not isinstance(request.prompt, str) or not 8 <= len(request.prompt.strip()) <= MAX_PROMPT_CHARS:
        raise MotionContractError('PROMPT_INVALID')
    if not isinstance(request.seed, int) or isinstance(request.seed, bool) or not SEED_MIN <= request.seed <= SEED_MAX:
        raise MotionContractError('SEED_INVALID')
    return request


def require_execution_authorization(ack: str, enabled: str) -> None:
    if ack != ACKNOWLEDGEMENT or enabled != 'true':
        raise MotionContractError('GPU_PROOF_NOT_AUTHORIZED')


def manifest(request: MotionRequest, output: bytes, *, model: str, revision: str) -> dict:
    if not isinstance(output, bytes) or not 1024 <= len(output) <= MAX_VIDEO_BYTES:
        raise MotionContractError('VIDEO_BYTES_INVALID')
    if b'ftyp' not in output[:32] or b'moov' not in output or b'mdat' not in output:
        raise MotionContractError('VIDEO_CONTAINER_INVALID')
    return {
        'schema_version': 1,
        'project_id': _uuid(request.project_id, 'PROJECT_ID'),
        'scene_id': _uuid(request.scene_id, 'SCENE_ID'),
        'source_image_id': _uuid(request.source_image_id, 'SOURCE_IMAGE_ID'),
        'generation_job_id': _uuid(request.generation_job_id, 'GENERATION_JOB_ID'),
        'source_sha256': request.image_sha256,
        'video_sha256': hashlib.sha256(output).hexdigest(),
        'video_bytes': len(output),
        'provider': 'modal',
        'model': model,
        'revision': revision,
        'frames_requested': FRAMES,
        'fps_requested': FPS,
        'seed': request.seed,
        'creator_approved': False,
        'subject_motion_verified': False,
        'full_scene_coverage_verified': False,
        'remote_inference_verified': False,
    }


def manifest_json(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True) + '\n'
