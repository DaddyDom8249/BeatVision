"""CPU-only process death tests of the real worker admission paths.

SQLite supplies a durable atomic Dict stand-in shared by independent processes.
It does not establish the real Modal service's atomicity or retention guarantees.
"""
import asyncio
import json
import multiprocessing
import os
import pathlib
import sqlite3
import tempfile
import unittest
from types import SimpleNamespace

from httpx import ASGITransport, AsyncClient
from providers.modal_motion.contracts import ACKNOWLEDGEMENT, MotionRequest, manifest
from providers.modal_motion.tests.test_submit_concurrency import IMAGE, body, worker_runtime


class DiskDict:
    def __init__(self, filename, crash=None):
        self.filename, self.crash = filename, crash

    def put(self, key, value, skip_if_exists=False):
        with sqlite3.connect(self.filename, timeout=20) as db:
            if skip_if_exists:
                if self.crash == 'before_reservation':
                    os._exit(42)
                changed = db.execute('insert or ignore into reservations values(?,?)', (key, json.dumps(value))).rowcount
            else:
                if self.crash == 'before_receipt':
                    os._exit(42)
                changed = db.execute('update reservations set value=? where key=?', (json.dumps(value), key)).rowcount
        if (skip_if_exists and self.crash == 'after_reservation') or (not skip_if_exists and self.crash == 'after_receipt'):
            os._exit(42)
        return bool(changed)

    def get(self, key):
        with sqlite3.connect(self.filename, timeout=20) as db:
            row = db.execute('select value from reservations where key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else None


def execute_child(filename, directory, entry, crash=None):
    store = DiskDict(filename, crash)
    video = b'\x00\x00\x00\x18ftypisom' + b'moovmdat' + b'0' * 2048

    def spawn(*args):
        # This is an event counter, NEVER a GPU/provider call.
        with sqlite3.connect(filename, timeout=20) as db:
            db.execute('insert into events values(?)', (os.getpid(),))
        if crash == 'after_acceptance':
            os._exit(42)
        return SimpleNamespace(object_id='fc-disk-fixture')

    result = {'video': video, 'manifest': manifest(MotionRequest(**body()['payload']), video,
        model='Lightricks/LTX-Video-0.9.5', revision='e58e28c39631af4d1468ee57a853764e11c1d37e')}
    worker = worker_runtime(store, spawn, lambda _: result)
    if entry == 'cli':
        os.environ['BRAGORA_MODAL_GPU_ENABLED'] = 'true'  # Stub SDK only.
        payload = {key: value for key, value in body()['payload'].items() if key != 'image_sha256'}
        try:
            worker.main(image_path=str(pathlib.Path(directory) / 'source.png'),
                output_dir=str(pathlib.Path(directory) / str(os.getpid())), execute=True,
                acknowledgment=ACKNOWLEDGEMENT, **payload)
        except Exception as exc:
            if str(exc) != 'MODAL_SUBMISSION_RECONCILIATION_REQUIRED':
                raise
    else:
        async def request():
            async with AsyncClient(transport=ASGITransport(app=worker.motion_api()), base_url='http://fixture') as client:
                response = await client.post('/submit', json=body())
                if response.status_code not in (200, 202):
                    raise AssertionError(response.status_code)
        asyncio.run(request())
    if crash == 'lost_reply':
        os._exit(42)


class ProcessRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.filename = str(pathlib.Path(self.temp.name) / 'reservations.sqlite')
        pathlib.Path(self.temp.name, 'source.png').write_bytes(IMAGE)
        with sqlite3.connect(self.filename) as db:
            db.executescript('create table reservations(key text primary key,value text);create table events(pid integer);')
        self.context = multiprocessing.get_context('spawn')

    def process(self, entry, crash=None):
        p = self.context.Process(target=execute_child, args=(self.filename, self.temp.name, entry, crash))
        p.start()
        return p

    def finish(self, p, code=0):
        p.join(30)
        if p.is_alive():
            p.kill(); p.join()
            self.fail('Fixture process exceeded 30 seconds')
        self.assertEqual(p.exitcode, code)

    def events(self):
        with sqlite3.connect(self.filename) as db:
            return db.execute('select count(*) from events').fetchone()[0]

    def test_twenty_independent_cli_http_processes_admit_one_execution(self):
        processes = [self.process('cli' if i % 2 else 'http') for i in range(20)]
        for p in processes:
            self.finish(p)
        self.assertEqual(self.events(), 1)
        self.assertEqual(DiskDict(self.filename).get(body()['payload']['generation_job_id'])['job_id'], 'fc-disk-fixture')

    def crash_case(self, crash, count, known):
        self.finish(self.process('cli', crash), 42)
        for entry in ('http', 'cli', 'http'):
            self.finish(self.process(entry))
        self.assertEqual(self.events(), count)
        receipt = DiskDict(self.filename).get(body()['payload']['generation_job_id'])
        self.assertEqual('job_id' in receipt, known)

    def test_crash_before_reservation_allows_one_first_execution(self):
        self.crash_case('before_reservation', 1, True)

    def test_death_after_durable_reservation_preserves_unknown_hold(self):
        self.crash_case('after_reservation', 0, False)

    def test_death_after_simulated_acceptance_never_resubmits(self):
        self.crash_case('after_acceptance', 1, False)

    def test_death_before_receipt_write_never_resubmits(self):
        self.crash_case('before_receipt', 1, False)

    def test_death_after_committed_receipt_recovers_same_identity(self):
        self.crash_case('after_receipt', 1, True)

    def test_lost_reply_after_commit_recovers_same_identity(self):
        self.crash_case('lost_reply', 1, True)


if __name__ == '__main__':
    unittest.main()
