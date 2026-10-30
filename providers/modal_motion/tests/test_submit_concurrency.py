"""Zero-GPU ASGI contention regression against the real Modal worker routes.

Requires fastapi and httpx in test environment. The Modal SDK is stubbed;
the shared reservation implementation deliberately uses synchronous methods,
matching Modal Dict's worker interface.
"""
import asyncio
import base64
import hashlib
import importlib.util
import json
import os
import pathlib
import sys
import tempfile
import threading
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import patch, MagicMock

from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from providers.modal_motion.contracts import ACKNOWLEDGEMENT, MotionContractError, MotionRequest, manifest

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


def worker_runtime(store, spawn, get_result=None, legacy_remote=None):
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
                fn.remote = legacy_remote or MagicMock(side_effect=AssertionError('Reservation bypass'))
                return fn
            return decorate
        def local_entrypoint(self): return lambda fn: fn

    fake_modal = SimpleNamespace(
        App=FakeApp, Image=FakeImage,
        Dict=SimpleNamespace(from_name=lambda *args, **kwargs: store),
        FunctionCall=SimpleNamespace(from_id=lambda call_id: SimpleNamespace(
            get=lambda **kwargs: get_result(call_id))),
        asgi_app=lambda **kwargs: (lambda fn: fn),
    )
    spec = importlib.util.spec_from_file_location('modal_worker_concurrency', ROOT / 'worker.py')
    worker = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'modal': fake_modal}):
        spec.loader.exec_module(worker)
    return worker


def worker_app(store, spawn):
    return worker_runtime(store, spawn).motion_api()


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


class CliReservationTests(unittest.TestCase):
    """Real CLI/HTTP code, shared fake durable store, no GPU or Modal SDK."""
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = pathlib.Path(self.directory.name)
        self.source = self.root / 'source.png'
        self.source.write_bytes(IMAGE)
        self.payload = body()['payload']
        self.video = b'\x00\x00\x00\x18ftypisom' + b'moovmdat' + b'0' * 2048
        self.store = MockModalDict()
        self.spawn = MagicMock(return_value=SimpleNamespace(object_id='fc-existing123'))
        self.get_result = MagicMock(return_value={
            'video': self.video,
            'manifest': manifest(MotionRequest(**self.payload), self.video,
                                 model='Lightricks/LTX-Video-0.9.5',
                                 revision='e58e28c39631af4d1468ee57a853764e11c1d37e'),
        })
        self.legacy_remote = MagicMock(side_effect=TimeoutError('MOCK_ACCEPTED_REPLY_LOST'))
        self.worker = self.restart()
        self.env = patch.dict(os.environ, {'BRAGORA_MODAL_GPU_ENABLED': 'true'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def restart(self):
        return worker_runtime(self.store, self.spawn, self.get_result, self.legacy_remote)

    def cli(self, worker=None, output='output', **changes):
        payload = {**self.payload, **changes}
        kwargs = {key: value for key, value in payload.items() if key != 'image_sha256'}
        (worker or self.worker).main(image_path=str(self.source), output_dir=str(self.root / output),
                                     execute=True, acknowledgment=ACKNOWLEDGEMENT, **kwargs)

    def http(self, worker=None, method='POST', path='/submit', data=None):
        app = (worker or self.worker).motion_api()
        async def request():
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://fixture') as client:
                return await client.request(method, path, json=body() if data is None else data)
        return asyncio.run(request())

    def assert_no_bypass(self, spawns=1):
        self.assertEqual(self.legacy_remote.call_count, 0)
        self.assertEqual(self.spawn.call_count, spawns)

    def test_cli_lost_result_reply_does_not_invoke_twice(self):
        self.get_result.side_effect = TimeoutError('MOCK_ACCEPTED_REPLY_LOST')
        for worker in [self.worker, self.restart()]:
            with self.assertRaises(TimeoutError):
                self.cli(worker)
        # Before repair the direct .remote path invokes GPU twice for this ID.
        self.assertEqual(self.spawn.call_count + self.legacy_remote.call_count, 1)
        self.assert_no_bypass()
        self.assertEqual(self.get_result.call_count, 2)

    def test_cli_then_http_reuses_same_receipt_and_preserves_output(self):
        self.cli()
        response = self.http(self.restart())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['job_id'], 'fc-existing123')
        lookup = self.http(method='GET', path='/receipt/' + self.payload['generation_job_id'])
        self.assertEqual(lookup.json()['job_id'], 'fc-existing123')
        stored = json.loads((self.root / 'output' / (self.payload['generation_job_id'] + '.json')).read_text())
        self.assertEqual(stored, self.get_result.return_value['manifest'])
        self.assertFalse(stored['creator_approved'])
        self.assert_no_bypass()

    def test_http_then_restarted_cli_reuses_receipt(self):
        self.assertEqual(self.http().status_code, 200)
        self.cli(self.restart())
        self.get_result.assert_called_once_with('fc-existing123')
        self.assert_no_bypass()

    def concurrent_first(self, first, second=None):
        second = second or ('http' if first == 'cli' else 'cli')
        entered, release = threading.Event(), threading.Event()
        def paused_spawn(*args):
            entered.set()
            if not release.wait(5):
                raise RuntimeError('Fixture release timed out')
            return SimpleNamespace(object_id='fc-existing123')
        self.spawn.side_effect = paused_spawn
        with ThreadPoolExecutor(max_workers=2) as pool:
            winner = pool.submit(self.cli if first == 'cli' else self.http)
            try:
                self.assertTrue(entered.wait(5))
                if second == 'http':
                    response = pool.submit(self.http, self.restart()).result(timeout=5)
                    self.assertEqual(response.status_code, 202)
                else:
                    loser = pool.submit(self.cli, self.restart())
                    with self.assertRaisesRegex(MotionContractError, 'RECONCILIATION_REQUIRED'):
                        loser.result(timeout=5)
            finally:
                release.set()
            winner.result(timeout=5)
        self.assertEqual(self.http().json()['job_id'], 'fc-existing123')
        self.assert_no_bypass()

    def test_cli_wins_concurrent_http_admission(self):
        self.concurrent_first('cli')

    def test_http_wins_concurrent_cli_admission(self):
        self.concurrent_first('http')

    def test_concurrent_cli_processes_share_one_reservation(self):
        self.concurrent_first('cli', 'cli')

    def test_spawn_acceptance_unknown_blocks_cli_and_http_after_restart(self):
        self.spawn.side_effect = TimeoutError('MOCK_SPAWN_REPLY_LOST')
        with self.assertRaises(TimeoutError):
            self.cli()
        with self.assertRaisesRegex(MotionContractError, 'RECONCILIATION_REQUIRED'):
            self.cli(self.restart())
        self.assertEqual(self.http(self.restart()).status_code, 202)
        self.assertEqual(self.http(method='GET', path='/receipt/' + self.payload['generation_job_id']).status_code, 202)
        self.assert_no_bypass()

    def test_receipt_persistence_crash_never_respawns(self):
        original_put = self.store.put
        def fail_receipt(key, value, skip_if_exists=False):
            if not skip_if_exists:
                raise RuntimeError('MOCK_RECEIPT_STORE_CRASH')
            return original_put(key, value, skip_if_exists=True)
        self.store.put = fail_receipt
        with self.assertRaisesRegex(RuntimeError, 'RECEIPT_STORE_CRASH'):
            self.cli()
        with self.assertRaisesRegex(MotionContractError, 'RECONCILIATION_REQUIRED'):
            self.cli(self.restart())
        self.assertEqual(self.http(self.restart()).status_code, 202)
        self.assertEqual(self.get_result.call_count, 0)
        self.assert_no_bypass()

    def test_lost_atomic_reservation_reply_never_authorizes_spawn(self):
        original_put = self.store.put
        interrupted = False
        def reserve_then_lose_reply(key, value, skip_if_exists=False):
            nonlocal interrupted
            result = original_put(key, value, skip_if_exists)
            if skip_if_exists and not interrupted:
                interrupted = True
                raise RuntimeError('MOCK_RESERVATION_REPLY_LOST')
            return result
        self.store.put = reserve_then_lose_reply
        with self.assertRaisesRegex(RuntimeError, 'RESERVATION_REPLY_LOST'):
            self.cli()
        with self.assertRaisesRegex(MotionContractError, 'RECONCILIATION_REQUIRED'):
            self.cli(self.restart())
        self.assertEqual(self.http().status_code, 202)
        self.assert_no_bypass(spawns=0)

    def test_committed_receipt_with_lost_write_reply_is_reused(self):
        original_put = self.store.put
        interrupted = False
        def persist_then_lose_reply(key, value, skip_if_exists=False):
            nonlocal interrupted
            result = original_put(key, value, skip_if_exists)
            if not skip_if_exists and not interrupted:
                interrupted = True
                raise RuntimeError('MOCK_RECEIPT_WRITE_REPLY_LOST')
            return result
        self.store.put = persist_then_lose_reply
        with self.assertRaisesRegex(RuntimeError, 'RECEIPT_WRITE_REPLY_LOST'):
            self.cli()
        self.cli(self.restart())
        self.assertEqual(self.http().json()['job_id'], 'fc-existing123')
        self.assert_no_bypass()

    def test_crash_after_reservation_before_spawn_stays_on_hold(self):
        fingerprint = hashlib.sha256(json.dumps(self.payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.store.put(self.payload['generation_job_id'], {'fingerprint': fingerprint, 'state': 'receipt_unknown'}, skip_if_exists=True)
        with self.assertRaisesRegex(MotionContractError, 'RECONCILIATION_REQUIRED'):
            self.cli(self.restart())
        self.assertEqual(self.http().status_code, 202)
        self.assert_no_bypass(spawns=0)

    def test_process_crash_after_receipt_is_recovered_without_new_spawn(self):
        self.get_result.side_effect = SystemExit('MOCK_PROCESS_CRASH')
        with self.assertRaises(SystemExit):
            self.cli()
        self.get_result.side_effect = None
        self.cli(self.restart())
        self.assert_no_bypass()

    def test_conflicting_identity_and_payload_never_reuse_receipt_or_spawn(self):
        self.assertEqual(self.http().status_code, 200)
        for changes in [{'project_id': str(uuid.UUID(int=8))}, {'prompt': 'Different approved direction in this scene.'}]:
            with self.subTest(changes=changes):
                with self.assertRaisesRegex(MotionContractError, 'FINGERPRINT_CONFLICT'):
                    self.cli(self.restart(), **changes)
                self.assertEqual(self.http(data=body(**changes)).status_code, 409)
        self.assertEqual(self.get_result.call_count, 0)
        self.assert_no_bypass()

    def test_conflicting_provider_result_cannot_be_relabelled_as_current_job(self):
        self.assertEqual(self.http().status_code, 200)
        self.get_result.return_value['manifest']['generation_job_id'] = str(uuid.UUID(int=9))
        with self.assertRaisesRegex(MotionContractError, 'PROVENANCE_INVALID'):
            self.cli(self.restart())
        self.assertFalse((self.root / 'output').exists())
        self.assert_no_bypass()

    def test_invalid_stored_receipt_stays_unresolved_without_gpu_execution(self):
        fingerprint = hashlib.sha256(json.dumps(self.payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        self.store.put(self.payload['generation_job_id'], {
            'fingerprint': fingerprint, 'state': 'accepted', 'job_id': 'invalid-call-id',
        }, skip_if_exists=True)
        with self.assertRaisesRegex(MotionContractError, 'RECONCILIATION_REQUIRED'):
            self.cli(self.restart())
        self.assertEqual(self.http().status_code, 202)
        self.assertEqual(self.get_result.call_count, 0)
        self.assert_no_bypass(spawns=0)

    def test_equivalent_job_uuid_text_uses_http_reservation(self):
        self.assertEqual(self.http().status_code, 200)
        self.cli(self.restart(), generation_job_id=self.payload['generation_job_id'].replace('-', ''))
        self.assertEqual(len(self.store.store), 1)
        self.assert_no_bypass()


if __name__ == '__main__':
    unittest.main()
