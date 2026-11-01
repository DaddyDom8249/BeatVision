"""Real loopback HTTP + SIGKILL, CPU only. No provider SDK or cloud call."""
import json
import asyncio
import base64
import pathlib
import subprocess
import sys
import tempfile
import unittest
import uuid
import time
from unittest.mock import MagicMock,patch

from providers.modal_motion.probe_crash_controller import CrashController,CrashControllerError
from providers.modal_motion.tests.http_probe_fixture import create_sqlite,payload
from providers.modal_motion.probe_client import Credentials,RequestBudget,StagingHTTPClient,PRODUCTION_ORIGIN
from providers.modal_motion.tests.http_probe_fixture import IMAGE,snapshot
from providers.modal_motion.tests.probe_campaign import TOKEN
from providers.modal_motion.admission import PostgresReceiptStore
from providers.modal_motion.staging import StagingProbe,create_app,CPU_ACK
from httpx import AsyncClient,ASGITransport
from providers.modal_motion.tests.probe_campaign import CASE_IDS,campaign,one_start_oracle


class OfflineHTTPTests(unittest.TestCase):
    def test_thirteen_case_campaign_uses_real_http_and_owned_process_crashes(self):
        with tempfile.TemporaryDirectory() as directory:
            values=[payload(10031+i) for i in range(12)]
            backend=create_sqlite(directory,str(uuid.uuid4()),values,[values[10]['generation_job_id']])
            evidence=campaign(backend,values,'a'*40)
        self.assertEqual(set(evidence['cases']),set(CASE_IDS))
        self.assertTrue(all(v['status']=='OFFLINE_PASS' for v in evidence['cases'].values()))
        self.assertTrue(all(v=='NOT_RUN' for v in evidence['live_cases'].values()))
        self.assertTrue(evidence['all_owned_workers_stopped'])
        kills=[e for e in evidence['worker_events'] if e['event']=='worker_killed']
        self.assertEqual(len(kills),7);self.assertEqual({e['exit_code'] for e in kills},{-9})
        self.assertEqual(evidence['cases']['NEGATIVE_ORACLE']['evidence']['counterexample_classification'],'FAIL')
        self.assertGreaterEqual(len(evidence['requests']),50)
        self.assertLessEqual(evidence['budget_used']['total'],112)
        rendered=json.dumps(evidence)
        for secret in ['admission_token','Authorization','image_base64',values[0]['prompt'],'offline-fixture-probe-token']:
            self.assertNotIn(secret,rendered)

    def test_controller_refuses_foreign_process_and_invalid_faults(self):
        controller=CrashController({'mode':'sqlite_fixture','request_hashes':{}},str(uuid.uuid4()),'x'*32)
        foreign=MagicMock()
        with self.assertRaisesRegex(CrashControllerError,'NOT_OWNED'):controller.stop(foreign)
        with self.assertRaisesRegex(CrashControllerError,'NOT_OWNED'):controller.crash_at_boundary(foreign)
        for kwargs in [{'boundary':'run-arbitrary-command'},{'refuse_write':'delete-ledger'},
                       {'boundary':'after_reserve'},{'job_id':str(uuid.uuid4())}]:
            with self.assertRaises(CrashControllerError):controller.start(**kwargs)
        foreign.process.kill.assert_not_called()

    def test_negative_oracle_cannot_hide_duplicate_events(self):
        self.assertTrue(one_start_oracle({'spawn_attempts':1,'fake_model_starts':1,'fake_completions':1}))
        self.assertFalse(one_start_oracle({'spawn_attempts':1,'fake_model_starts':2,'fake_completions':1}))

    def test_controller_attempts_all_owned_cleanup_even_after_a_failure(self):
        controller=CrashController({'mode':'sqlite_fixture','request_hashes':{}},str(uuid.uuid4()),'x'*32)
        controller.workers=[object(),object()]
        with patch.object(controller,'stop',side_effect=[CrashControllerError('FIXTURE_CLEANUP_TIMEOUT'),None]) as stop:
            with self.assertRaisesRegex(CrashControllerError,'CLEANUP_TIMEOUT'):controller.close()
            self.assertEqual(stop.call_count,2)

    def test_owned_transport_is_killed_at_timeout_then_get_recovers_without_post(self):
        with tempfile.TemporaryDirectory() as directory:
            value=payload(10031);run=str(uuid.uuid4())
            backend=create_sqlite(directory,run,[value])
            with CrashController(backend,run,TOKEN) as controller:
                worker=controller.start(delay_reply=2)
                def client(timeout,recovery=False):
                    return StagingHTTPClient(worker.permit.origin,worker.permit.origin,PRODUCTION_ORIGIN,
                        run,'a'*40,backend['request_hashes'],Credentials(TOKEN),
                        RequestBudget(post=1,get=1,total=2,timeout=timeout),fixture=worker.permit,recovery_only=recovery)
                submitter=client(.75);started=time.monotonic()
                lost=submitter.submit(value,IMAGE)
                self.assertLess(time.monotonic()-started,2)
                self.assertIsNone(lost['http_status']);self.assertTrue(lost['acceptance_unknown'])
                self.assertEqual(lost['transport_exit'],-9)
                before=snapshot(backend,value['generation_job_id'])
                self.assertTrue(one_start_oracle(before['counts']))
                recovery=client(2,True);found=recovery.lookup(value['generation_job_id'])
                self.assertEqual(found['receipt_digest'],before['receipt_digest'])
                self.assertEqual(recovery.budget.used['POST'],0)
                self.assertEqual(snapshot(backend,value['generation_job_id']),before)

    def test_default_cli_is_nonexecuting_and_live_flags_are_rejected(self):
        root=pathlib.Path(__file__).resolve().parents[3]
        command=[sys.executable,'-B',str(root/'scripts/test/run_protocol2_http_probe.py')]
        result=subprocess.run(command,cwd=root,capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0)
        plan=json.loads(result.stdout)
        self.assertEqual(plan['default_execution'],'NONE');self.assertEqual(plan['decision'],'LIVE_BLOCKED')
        template=json.loads((root/'docs/audits/pr164-staging-evidence-template.json').read_text())
        self.assertEqual(set(template['cases']),set(plan['case_ids']))
        self.assertEqual(template['decision'],'BLOCKED')
        for option in ['--live','--url','--pid','--command','--approved']:
            denied=subprocess.run(command+[option,'1'],cwd=root,capture_output=True,text=True,timeout=5)
            self.assertEqual(denied.returncode,2)

    def test_postgres_rpc_refusal_is_sanitized_to503_before_fake_execution(self):
        run=str(uuid.uuid4());opener=MagicMock()
        opener.open.side_effect=RuntimeError('synthetic SQL lineage refusal')
        store=PostgresReceiptStore('https://isolated-fixture.supabase.co','fixture-only',opener)
        def rpc(action,*args,**kwargs):
            return {'run_id':run,'schema':2,'fake_only':True} if action=='ready' else True
        probe=StagingProbe(lambda:store,rpc,run,'local-fixture');probe.fake_spawn=MagicMock()
        async def send():
            async with AsyncClient(transport=ASGITransport(app=create_app(probe,TOKEN)),base_url='http://fixture') as client:
                return await client.post('/submit',headers={'Authorization':'Bearer '+TOKEN},json={
                    'payload':payload(10031),'image_base64':base64.b64encode(IMAGE).decode(),'ack':CPU_ACK})
        response=asyncio.run(send())
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json(),{'error':'MODAL_LEDGER_UNAVAILABLE'})
        probe.fake_spawn.assert_not_called();opener.open.assert_called_once()


if __name__=='__main__':unittest.main()
