"""Zero-GPU ASGI contention regression against the real Modal worker routes.

Requires fastapi and httpx in test environment. The Modal SDK is stubbed;
the shared reservation implementation deliberately uses synchronous methods,
matching Modal Dict's worker interface.
"""
import asyncio
import base64
import hashlib
import importlib.util
import pathlib
import sys
import threading
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from providers.modal_motion.contracts import ACKNOWLEDGEMENT

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMAGE = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32


class MockModalDict:
    def __init__(self):
        self.store = {}
        self.lock = threading.Lock()
        self.put_calls = 0

    def put(self, key, value, skip_if_exists=False):
        with self.lock:
            self.put_calls += 1
            if skip_if_exists and key in self.store:
                return False
            self.store[key] = value
            return True

    def get(self, key):
        with self.lock:
            return self.store.get(key)


def worker_app(store, spawn):
    class FakeImage:
        @staticmethod
        def debian_slim(**kw): return FakeImage()
        def pip_install(self, *args): return self
        def add_local_python_source(self, *args): return self

    class FakeApp:
        def __init__(self, *args): pass
        def function(self, **kwargs):
            def decorate(fn):
                fn.spawn = spawn
                return fn
            return decorate
        def local_entrypoint(self): return lambda fn: fn

    fake_modal = SimpleNamespace(
        App=FakeApp, Image=FakeImage,
        Dict=SimpleNamespace(from_name=lambda *args, **kwargs: store),
        asgi_app=lambda **kwargs: (lambda fn: fn),
    )
    spec = importlib.util.spec_from_file_location('modal_worker_concurrency', ROOT / 'worker.py')
    worker = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'modal': fake_modal}):
        spec.loader.exec_module(worker)
    return worker.motion_api()


def body(**overrides):
    payload = dict(
        project_id=str(uuid.UUID(int=1)), scene_id=str(uuid.UUID(int=2)),
        source_image_id=str(uuid.UUID(int=3)),
        generation_job_id=str(uuid.UUID(int=4)),
        image_sha256=hashlib.sha256(IMAGE).hexdigest(),
        prompt='A character walks naturally across the scene.', seed=42,
    )
    payload.update(overrides)
    return {'payload': payload, 'image_base64': base64.b64encode(IMAGE).decode(),
            'ack': ACKNOWLEDGEMENT}


class SubmissionConcurrencyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.store = MockModalDict()
        self.spawn = MagicMock(return_value=SimpleNamespace(object_id='fc-existing123'))
        self.app = worker_app(self.store, self.spawn)

    async def request(self, data):
        async with AsyncClient(transport=ASGITransport(app=self.app), base_url='http://test') as client:
            return await client.post('/submit', json=data)

    async def test_twenty_identical_requests_spawn_once(self):
        responses = await asyncio.gather(*(self.request(body()) for _ in range(20)))
        self.assertEqual(self.spawn.call_count, 1)
        self.assertTrue(all(r.status_code in (200, 202) for r in responses))
        self.assertTrue(all(r.json().get('job_id') == 'fc-existing123'
                            or r.json().get('status') == 'reconciliation_required' for r in responses))

    async def test_equivalent_uuid_text_reserves_one_job(self):
        canonical = str(uuid.UUID(int=4))
        upper = canonical.upper()
        compact = canonical.replace('-', '')
        responses = [await self.request(body(generation_job_id=value))
                     for value in (canonical, upper, compact)]
        # All three are accepted UUID representations and must share a key.
        self.assertEqual(responses[0].status_code, 200)
        self.assertEqual(responses[1].status_code, 200)
        self.assertEqual(responses[2].status_code, 200)
        self.assertEqual(self.spawn.call_count, 1)
        self.assertEqual(len(self.store.store), 1)

    async def test_conflicting_fingerprint_is_409(self):
        first = await self.request(body())
        second = await self.request(body(prompt='A different approved creative direction here.'))
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(self.spawn.call_count, 1)

    async def test_lost_receipt_persistence_blocks_repeated_spawn(self):
        original_put = self.store.put
        def fail_receipt_update(key, value, skip_if_exists=False):
            if not skip_if_exists:
                raise RuntimeError('simulated receipt persistence crash')
            return original_put(key, value, skip_if_exists=True)
        self.store.put = fail_receipt_update
        with self.assertRaisesRegex(RuntimeError, 'receipt persistence crash'):
            await self.request(body())
        response = await self.request(body())
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()['status'], 'reconciliation_required')
        self.assertEqual(self.spawn.call_count, 1)

    async def test_restart_reuses_known_receipt(self):
        self.assertEqual((await self.request(body())).status_code, 200)
        other = worker_app(self.store, self.spawn)
        async with AsyncClient(transport=ASGITransport(app=other), base_url='http://test') as client:
            response = await client.post('/submit', json=body())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['job_id'], 'fc-existing123')
        self.assertEqual(self.spawn.call_count, 1)

    async def test_existing_unknown_reservation_never_respawns(self):
        self.store.put(str(uuid.UUID(int=4)), {'fingerprint': hashlib.sha256(
            __import__('json').dumps(body()['payload'], sort_keys=True, separators=(',', ':')).encode()
        ).hexdigest(), 'state': 'receipt_unknown'}, skip_if_exists=True)
        response = await self.request(body())
        self.assertEqual(response.status_code, 202)
        self.assertEqual(self.spawn.call_count, 0)


if __name__ == '__main__':
    unittest.main()
