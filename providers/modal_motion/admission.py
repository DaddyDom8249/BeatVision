"""Permanent PostgreSQL admission through a server-only, service-scoped RPC.

No network access at import. No retry and no expiring/local permission fallback.
The tiny get/put interface keeps the worker's existing admission ordering intact.
"""
import json
import os
import re
import uuid
import urllib.error
import urllib.parse
import urllib.request

from providers.modal_motion.contracts import MotionContractError


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PostgresReceiptStore:
    def __init__(self, url, key, opener=None):
        try:
            parsed = urllib.parse.urlsplit(url)
            port = parsed.port
        except ValueError:
            raise MotionContractError('MODAL_LEDGER_CONFIGURATION_INVALID') from None
        if (parsed.scheme != 'https' or parsed.username or parsed.password or
                port not in (None, 443) or parsed.path not in ('', '/') or
                parsed.query or parsed.fragment or
                not re.fullmatch(r'[a-z0-9-]+\.supabase\.co', parsed.hostname or '')):
            raise MotionContractError('MODAL_LEDGER_CONFIGURATION_INVALID')
        if not key or '\n' in key or '\r' in key:
            raise MotionContractError('MODAL_LEDGER_CONFIGURATION_INVALID')
        self.url = url.rstrip('/') + '/rest/v1/rpc/modal_motion_admission'
        self.key = key
        self.opener = opener or urllib.request.build_opener(_NoRedirect())

    @classmethod
    def from_env(cls):
        return cls(os.environ.get('SUPABASE_URL', ''), os.environ.get('SUPABASE_SERVICE_ROLE_KEY', ''))

    def _rpc(self, key, operation, record=None):
        execution = key.startswith('execution:')
        raw_id = key.removeprefix('execution:') if execution else key
        try:
            job_id = str(uuid.UUID(raw_id))
        except (ValueError, AttributeError, TypeError) as exc:
            raise MotionContractError('MODAL_REQUEST_ID_INVALID') from exc
        body = json.dumps({'p_job_id': job_id, 'p_operation': operation,
                           'p_record': record, 'p_execution': execution}).encode()
        req = urllib.request.Request(self.url, data=body, method='POST', headers={
            'Authorization': 'Bearer ' + self.key, 'apikey': self.key,
            'Content-Type': 'application/json',
        })
        try:
            with self.opener.open(req, timeout=10) as reply:
                if reply.status != 200:
                    raise ValueError('Unexpected ledger status')
                raw = reply.read(32769)
                if len(raw) > 32768:
                    raise ValueError('Ledger reply exceeds limit')
                result = json.loads(raw)
        except Exception as exc:
            # Never expose URLs, keys, raw RPC bodies or database error details.
            raise MotionContractError('MODAL_LEDGER_UNAVAILABLE') from None
        if operation == 'lookup':
            if result is not None and not isinstance(result, dict):
                raise MotionContractError('MODAL_LEDGER_RESPONSE_INVALID')
        elif type(result) is not bool:
            raise MotionContractError('MODAL_LEDGER_RESPONSE_INVALID')
        return result

    def get(self, key):
        return self._rpc(key, 'lookup')

    def put(self, key, value, skip_if_exists=False):
        if key.startswith('execution:'):
            if not skip_if_exists:
                raise MotionContractError('MODAL_LEDGER_OPERATION_INVALID')
            operation = 'begin'
        else:
            operation = 'reserve' if skip_if_exists else 'receipt'
        return self._rpc(key, operation, value)
