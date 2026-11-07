"""Shared protocol-2 admission. No SDK, network, model or GPU import.

Production and CPU probes inject only transport, spawn and execution identity.
Ordering and one-shot semantics are shared; no synthetic receipt is created here.
"""
import hashlib
import json
import re
import uuid
from providers.modal_motion.contracts import (MotionContractError, MotionRequest,
    require_execution_authorization, validate_request)


def request_fingerprint(payload: dict):
    normalized = {**payload, 'generation_job_id': str(uuid.UUID(payload['generation_job_id']))}
    normalized.pop('admission_token', None)
    return hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def publish_execution_receipt(payload: dict, store_factory, current_call_id):
    """Recover a lost caller reply once the reserved execution actually starts.

    PostgreSQL admission never expires or re-grants an existing claim. This
    still does not make the database/provider boundary atomic or reclaimable.
    """
    key = str(uuid.UUID(payload['generation_job_id']))
    fingerprint = request_fingerprint(payload)
    call_id = current_call_id()
    if not isinstance(call_id, str) or not re.fullmatch(r'fc-[A-Za-z0-9_-]+', call_id):
        raise MotionContractError('MODAL_JOB_RECEIPT_INVALID')
    receipts = store_factory()
    existing = receipts.get(key)
    if existing and existing.get('legacy_hold'):
        raise MotionContractError('MODAL_LEGACY_EXECUTION_UNCERTAIN')
    if not isinstance(existing, dict) or existing.get('fingerprint') != fingerprint:
        raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
    if existing.get('job_id') not in (None, call_id):
        raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
    token = payload.get('admission_token')
    if not isinstance(token, str) or existing.get('admission_token') != token:
        raise MotionContractError('MODAL_ADMISSION_TOKEN_INVALID')
    execution = {'fingerprint': fingerprint, 'state': 'accepted', 'job_id': call_id, 'admission_token': token}
    # Fence competing executions and same-call re-entry before model loading.
    # The immutable claim itself contains the receipt, so interruption of the
    # following convenience update cannot hide an already admitted call.
    if not receipts.put('execution:' + key, execution, skip_if_exists=True):
        raise MotionContractError('MODAL_EXECUTION_ALREADY_ADMITTED')
    receipts.put(key, execution)


def submission_receipt(receipts, generation_job_id: str, fingerprint=None):
    key = str(uuid.UUID(generation_job_id))
    existing = receipts.get(key)
    execution = receipts.get('execution:' + key)
    if not isinstance(existing, dict) and isinstance(execution, dict):
        existing = {'fingerprint': execution.get('fingerprint')}
    if isinstance(existing, dict) and existing.get('legacy_hold'):
        receipt = existing.get('job_id')
        if isinstance(receipt, str) and re.fullmatch(r'fc-[A-Za-z0-9_-]+', receipt):
            return {'status': 'processing', 'job_id': receipt}
        return {'status': 'reconciliation_required', 'receipt_known': False}
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


def reserve_motion(payload: dict, source: bytes, ack: str, store_factory, spawn):
    """Shared CLI/HTTP admission. An uncertain reservation is never reclaimed.

    This contains duplicates while the durable reservation exists; reservation,
    provider acceptance and receipt persistence are still separate operations.
    """
    require_execution_authorization(ack, 'true')
    if payload.get('admission_protocol') != 2:
        raise MotionContractError('MODAL_ADMISSION_PROTOCOL_REQUIRED')
    validated = MotionRequest(**payload)
    validate_request(validated, source)
    key = str(uuid.UUID(validated.generation_job_id))
    payload = {**payload, 'generation_job_id': key}
    payload.pop('admission_token', None)
    fingerprint = request_fingerprint(payload)
    receipts = store_factory()
    token = str(uuid.uuid4())
    reservation = {'fingerprint': fingerprint, 'state': 'receipt_unknown', 'admission_token': token, 'request': payload}
    if not receipts.put(key, reservation, skip_if_exists=True):
        return submission_receipt(receipts, key, fingerprint)
    # Consult the independent execution receipt before spawning. Neither
    # PostgreSQL claim expires; a known execution must always win over submit.
    retained = submission_receipt(receipts, key, fingerprint)
    if retained.get('job_id'):
        return retained
    # A crash before/after spawn or during receipt persistence leaves the hold
    # intact. Neither entry point may infer that another execution is safe.
    payload = {**payload, 'admission_token': token}
    call = spawn(payload, source, ack)
    if not re.fullmatch(r'fc-[A-Za-z0-9_-]+', call.object_id):
        raise MotionContractError('MODAL_JOB_RECEIPT_INVALID')
    observed = submission_receipt(receipts, key, fingerprint)
    if observed.get('job_id') not in (None, call.object_id):
        raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
    receipts.put(key, {'fingerprint': fingerprint, 'state': 'accepted', 'job_id': call.object_id, 'admission_token': token})
    return {'status': 'processing', 'job_id': call.object_id}
