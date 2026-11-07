"""Local CPU probe contracts; no provider, database or network access."""
import base64
import json
import os
import sys
import unittest
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from providers.modal_motion import staging
from providers.modal_motion.contracts import MotionContractError
from providers.modal_motion.tests.test_submit_concurrency import IMAGE, body, MockModalDict, worker_runtime

RUN='00000000-0000-0000-0000-000000001111'
TOKEN='fixture-token-at-least-32-characters'


class ProbeTests(unittest.IsolatedAsyncioTestCase):
    def fixture(self):
        store=MockModalDict();events=[]
        def rpc(action,job_id=None,**kwargs):
            if action=='ready':return {'run_id':RUN,'schema':2,'fake_only':True}
            if action=='allowed':return True
            if action=='event':events.append(kwargs);return True
            if action=='summary':return {'events':events.copy()}
            raise AssertionError(action)
        probe=staging.StagingProbe(lambda:store,rpc,RUN,'local-worker-fixture')
        return probe,store,events

    async def test_same_job_uses_shared_protocol_and_has_one_fake_start(self):
        probe,store,events=self.fixture();data=body()
        first=probe.submit(data['payload'],IMAGE,staging.CPU_ACK)
        again=probe.submit(data['payload'],IMAGE,staging.CPU_ACK)
        self.assertEqual(first['job_id'],again['job_id'])
        self.assertTrue(first['synthetic']);self.assertEqual(first['protocol'],2)
        self.assertEqual([e['phase'] for e in events],['spawn_attempt','model_start','completed'])
        self.assertIn('execution:'+data['payload']['generation_job_id'],store.store)
        self.assertEqual(len({e['event_id'] for e in events}),3)

    async def test_missing_or_wrong_readiness_cannot_grant(self):
        for reply in [None,{}, {'run_id':RUN,'schema':1,'fake_only':True},
                      {'run_id':RUN,'schema':True,'fake_only':True},
                      {'run_id':'other','schema':2,'fake_only':True},
                      {'run_id':RUN,'schema':2,'fake_only':False}]:
            store=MagicMock();rpc=MagicMock(return_value=reply)
            probe=staging.StagingProbe(lambda:store,rpc,RUN,'local-fixture')
            with self.assertRaises(MotionContractError):probe.submit(body()['payload'],IMAGE,staging.CPU_ACK)
            store.put.assert_not_called()

    async def test_http_authentication_precedes_any_database_access(self):
        probe,_,_=self.fixture();probe.checked_store=MagicMock(side_effect=AssertionError('No DB access'))
        async with AsyncClient(transport=ASGITransport(app=staging.create_app(probe,TOKEN)),base_url='http://fixture') as http:
            for headers in [{},{'Authorization':'Bearer wrong'}]:
                response=await http.post('/submit',json={},headers=headers)
                self.assertEqual(response.status_code,401)
        probe.checked_store.assert_not_called()

    async def test_http_rejects_fault_controls_and_returns_no_ledger_secrets(self):
        probe,_,_=self.fixture();data=body();data['ack']=staging.CPU_ACK
        async with AsyncClient(transport=ASGITransport(app=staging.create_app(probe,TOKEN)),base_url='http://fixture',
            headers={'Authorization':'Bearer '+TOKEN}) as http:
            self.assertEqual((await http.post('/submit',json={**data,'crash':'after_reservation'})).status_code,400)
            accepted=await http.post('/submit',json=data);self.assertEqual(accepted.status_code,200)
            response=await http.get('/verify/'+data['payload']['generation_job_id'])
            self.assertEqual(response.status_code,200)
            for forbidden in ['admission_token','fingerprint',data['payload']['prompt']]:
                self.assertNotIn(forbidden,response.text)

    async def test_uncertain_acceptance_holds_without_another_fake_attempt(self):
        probe,store,events=self.fixture()
        def checkpoint(phase):
            if phase=='after_acceptance':raise RuntimeError('Injected lost reply')
        probe.checkpoint=checkpoint
        with self.assertRaises(RuntimeError):probe.submit(body()['payload'],IMAGE,staging.CPU_ACK)
        fresh=staging.StagingProbe(lambda:store,probe.rpc,RUN,'local-restarted')
        result=fresh.submit(body()['payload'],IMAGE,staging.CPU_ACK)
        self.assertEqual(result['status'],'reconciliation_required')
        self.assertEqual([e['phase'] for e in events],['spawn_attempt'])

    async def test_wrong_ack_unprepared_job_and_unavailable_marker_fail_closed(self):
        probe,store,events=self.fixture()
        with self.assertRaises(MotionContractError):probe.submit(body()['payload'],IMAGE,'')
        probe.rpc=lambda *a,**kw:False
        with self.assertRaises(MotionContractError):probe.submit(body()['payload'],IMAGE,staging.CPU_ACK)
        self.assertEqual(store.store,{});self.assertEqual(events,[])

    async def test_staging_configuration_has_no_production_fallback(self):
        with patch.dict(os.environ,{'SUPABASE_URL':'https://production.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'never-use'},clear=True):
            with self.assertRaises(MotionContractError):staging.from_env()
        values={'BEATVISION_PROTOCOL2_STAGING':'ISOLATED_CPU_ONLY',
          'BEATVISION_STAGING_SUPABASE_URL':'https://stage.supabase.co',
          'BEATVISION_STAGING_EXPECTED_ORIGIN':'https://stage.supabase.co',
          'BEATVISION_PRODUCTION_SUPABASE_URL':'https://production.supabase.co',
          'BEATVISION_STAGING_SERVICE_ROLE_KEY':'fixture-only',
          'BEATVISION_STAGING_RUN_ID':RUN,'BEATVISION_STAGING_PROBE_TOKEN':TOKEN}
        with patch.dict(os.environ,values,clear=True):
            probe,token=staging.from_env();self.assertEqual(token,TOKEN)
            for key,value in [('BEATVISION_STAGING_EXPECTED_ORIGIN','https://other.supabase.co'),
                              ('BEATVISION_PRODUCTION_SUPABASE_URL','https://stage.supabase.co')]:
                with patch.dict(os.environ,{key:value}):
                    with self.assertRaises(MotionContractError):staging.from_env()

    async def test_probe_import_does_not_load_modal_or_models(self):
        import subprocess
        code="import sys;from providers.modal_motion import staging;assert not any(x in sys.modules for x in ['modal','torch','diffusers','providers.modal_motion.worker'])"
        subprocess.run([sys.executable,'-c',code],check=True)

    async def test_equivalent_production_origins_are_rejected_before_transport(self):
        values={'BEATVISION_PROTOCOL2_STAGING':'ISOLATED_CPU_ONLY',
          'BEATVISION_PRODUCTION_SUPABASE_URL':'https://production.supabase.co',
          'BEATVISION_STAGING_SERVICE_ROLE_KEY':'fixture-only','BEATVISION_STAGING_RUN_ID':RUN,
          'BEATVISION_STAGING_PROBE_TOKEN':TOKEN}
        for url in ['https://PRODUCTION.supabase.co','https://production.supabase.co:443',
                    'https://production.supabase.co/','https://PRODUCTION.supabase.co:443/']:
            with self.subTest(url=url),patch.dict(os.environ,{**values,
                'BEATVISION_STAGING_SUPABASE_URL':url,'BEATVISION_STAGING_EXPECTED_ORIGIN':url},clear=True):
                with self.assertRaises(MotionContractError):staging.from_env()

    async def test_production_wrappers_call_the_same_protocol_with_real_dependencies(self):
        spawn=MagicMock();worker=worker_runtime(None,spawn)
        payload=body()['payload']
        with patch.object(staging.protocol,'reserve_motion',return_value='sentinel') as reserve:
            self.assertEqual(worker._reserve_motion(payload,IMAGE,'ack'),'sentinel')
            reserve.assert_called_once_with(payload,IMAGE,'ack',worker._submission_receipts,spawn)
        with patch.object(staging.protocol,'publish_execution_receipt') as publish:
            worker._publish_execution_receipt(payload)
            publish.assert_called_once_with(payload,worker._submission_receipts,worker.modal.current_function_call_id)
