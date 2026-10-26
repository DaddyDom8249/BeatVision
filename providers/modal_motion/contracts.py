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
# LTX-Video's text-conditioning path is configured around a 128-token
# sequence. Keep this limit explicit and apply it with the actual model
# tokenizer at the last possible boundary before inference.
MAX_PROMPT_TOKENS = 128
WIDTH = 704
HEIGHT = 480
FRAMES = 49  # Legacy/default proof length; longer requests are explicit.
MAX_FRAMES = 161  # Bounded LTX 0.9.5 duration trial; not a full-song promise.
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
    frames: int = FRAMES


def budget_ltx_prompt(prompt: str, tokenizer, *, max_tokens: int = MAX_PROMPT_TOKENS,
                      required_prefix: str = '', strict: bool = False) -> str:
    """Token-bound a mandatory preservation prefix before optional scene details.

    The exact loaded model tokenizer performs all counts. Never discard required
    conditioning to fit optional decoration. BatchEncoding supports Mapping
    methods without necessarily inheriting from ``dict``.
    """
    if not isinstance(prompt, str) or not prompt.strip():
        raise MotionContractError('PROMPT_INVALID')
    if not isinstance(max_tokens, int) or isinstance(max_tokens, bool) or max_tokens < 1:
        raise MotionContractError('PROMPT_TOKEN_BUDGET_INVALID')
    if not callable(tokenizer) or not callable(getattr(tokenizer, 'decode', None)):
        raise MotionContractError('PROMPT_TOKENIZER_UNAVAILABLE')
    if not isinstance(required_prefix, str):
        raise MotionContractError('PROMPT_TOKEN_BUDGET_INVALID')

    def ids(text: str):
        try:
            encoded = tokenizer(text, add_special_tokens=True, truncation=False)
            token_ids = encoded.get('input_ids') if hasattr(encoded, 'get') else getattr(encoded, 'input_ids', None)
            if hasattr(token_ids, 'tolist'):
                token_ids = token_ids.tolist()
            while isinstance(token_ids, (tuple, list)) and token_ids and isinstance(token_ids[0], (tuple, list)):
                token_ids = token_ids[0]
            if not isinstance(token_ids, (tuple, list)) or not token_ids or not all(isinstance(x, int) for x in token_ids):
                raise ValueError('missing token ids')
            return list(token_ids)
        except Exception as exc:
            raise MotionContractError('PROMPT_TOKENIZATION_FAILED') from exc

    mandatory = required_prefix.strip()
    if mandatory and len(ids(mandatory)) > max_tokens:
        raise MotionContractError('PROMPT_REQUIRED_TEXT_TOO_LONG')
    full = ((mandatory + ' ' + prompt.strip()).strip() if mandatory else prompt.strip())
    if len(full) > MAX_PROMPT_CHARS:
        if strict:
            raise MotionContractError('PROMPT_TOKEN_BUDGET_EXCEEDED')
        # Overlength optional material cannot displace or truncate required text.
        full = full[:MAX_PROMPT_CHARS].rstrip()
    full_ids = ids(full)
    if len(full_ids) <= max_tokens:
        return full
    if strict:
        raise MotionContractError('PROMPT_TOKEN_BUDGET_EXCEEDED')
    # Tokenizer exact accounting after decode; special tokens may be inserted
    # or normalized on decode. Shrink until the final encoded prompt fits.
    if not mandatory:
        try:
            candidate = tokenizer.decode(full_ids[:max_tokens], skip_special_tokens=True,
                                         clean_up_tokenization_spaces=True).strip()
        except Exception as exc:
            raise MotionContractError('PROMPT_TOKENIZATION_FAILED') from exc
        if 8 <= len(candidate) <= MAX_PROMPT_CHARS and len(ids(candidate)) <= max_tokens:
            return candidate
        raise MotionContractError('PROMPT_TOKEN_BUDGET_INVALID')
    optional = prompt.strip()
    lo, hi = 0, len(optional)
    best = mandatory
    while lo <= hi:
        mid = (lo + hi) // 2
        candidate = (mandatory + ' ' + optional[:mid]).strip()[:MAX_PROMPT_CHARS].rstrip()
        if len(ids(candidate)) <= max_tokens:
            best = candidate
            lo = mid + 1
        else:
            hi = mid - 1
    if not best.startswith(mandatory) or len(best) < 8 or len(ids(best)) > max_tokens:
        raise MotionContractError('PROMPT_TOKEN_BUDGET_INVALID')
    return best


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
    if type(request.frames) is not int or not FRAMES <= request.frames <= MAX_FRAMES or (request.frames - 1) % 8:
        raise MotionContractError('FRAME_COUNT_INVALID')
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
        'frames_requested': request.frames,
        'fps_requested': FPS,
        'seed': request.seed,
        'creator_approved': False,
        'subject_motion_verified': False,
        'full_scene_coverage_verified': False,
        'remote_inference_verified': False,
    }


def manifest_json(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True) + '\n'
