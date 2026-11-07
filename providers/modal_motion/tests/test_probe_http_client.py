"""No network: adversarial client policy, protocol and evidence regressions."""
import base64
import concurrent.futures
import json
import math
import time
import unittest
from unittest.mock import MagicMock,patch

from providers.modal_motion.probe_client import (Credentials,LivePermit,ProbeClientError,
    RequestBudget,StagingHTTPClient,PRODUCTION_ORIGIN,payload_digest,_http_exchange,ProcessTransport)
from providers.modal_motion.tests.http_probe_fixture import IMAGE,payload,uid

RUN=uid(999);ORIGIN='https://fixture--protocol2.modal.run'


class ClientPolicyTests(unittest.TestCase):
    def client(self,**options):
        p=payload(10031);transport=MagicMock()
        value={'protocol':2,'synthetic':True,'run_id':RUN,'status':'processing',
            'job_id':'fc-staging-'+'a'*32,'worker_id':'modal-ta-fixture',
            'spawn_attempts':1,'fake_model_starts':1,'fake_completions':1}
        transport.exchange.return_value={'status':200,'body':base64.b64encode(json.dumps(value).encode()).decode()}
        def authorized(scope,method,job):
            return LivePermit(payload_digest(scope),min(time.time()+30,scope['expires_utc']),
                'mock-owner','mock-account','mock-database','mock-teardown')
        args=dict(origin=ORIGIN,approved_origin=ORIGIN,production_origin=PRODUCTION_ORIGIN,
            run_id=RUN,source_commit='a'*40,request_hashes={p['generation_job_id']:payload_digest(p)},
            credentials=Credentials('fixture-probe-token-32-characters-minimum','fixture-key','fixture-secret'),
            budget=RequestBudget(post=4,get=4,total=8),authorizer=authorized,transport=transport)
        args.update(options);return StagingHTTPClient(**args),transport,p,value

    def test_live_default_and_environment_flags_do_not_authorize_transport(self):
        client,transport,p,_=self.client(authorizer=None)
        with patch.dict('os.environ',{'LIVE_APPROVED':'true','BEATVISION_PROTOCOL2_STAGING':'ISOLATED_CPU_ONLY'}):
            with self.assertRaisesRegex(ProbeClientError,'NOT_AUTHORIZED'):client.submit(p,IMAGE)
        transport.exchange.assert_not_called();self.assertEqual(client.budget.used['total'],0)

    def test_origin_denial_canonicalization_and_ssrf_inputs_precede_transport(self):
        for url in [PRODUCTION_ORIGIN,PRODUCTION_ORIGIN.upper().replace('HTTPS','https')+':443/',
            'http://fixture.modal.run','https://fixture.modal.run.evil.test','https://fixture.modal.run@evil.test',
            'https://fixture.modal.run/path','https://fixture.modal.run?','https://fixture.modal.run#',
            'https://fixture.modal.run:444','https://127.0.0.1','http://127.0.0.1:12345']:
            with self.subTest(url=url),self.assertRaises(ProbeClientError):self.client(origin=url,approved_origin=url)

    def test_production_app_label_is_denied_across_unverified_regional_aliases(self):
        label=PRODUCTION_ORIGIN.split('://',1)[1].split('.',1)[0]
        for suffix in ['modal.run','us-west.modal.run','eu-west.modal.run']:
            url='https://'+label+'.'+suffix
            with self.subTest(url=url),self.assertRaises(ProbeClientError):self.client(origin=url,approved_origin=url)

    def test_short_permit_lifetime_caps_total_transport_deadline(self):
        def short(scope,*args):return LivePermit(payload_digest(scope),time.time()+.25,'x','x','x','x')
        client,transport,p,_=self.client(authorizer=short)
        client.submit(p,IMAGE)
        self.assertLessEqual(transport.exchange.call_args.args[5],.25)
        self.assertIn('deadline',transport.exchange.call_args.kwargs)

    def test_expiry_during_connection_setup_never_dispatches(self):
        connection=MagicMock();send=MagicMock()
        with patch('providers.modal_motion.probe_client.http.client.HTTPSConnection',return_value=connection), \
             patch('providers.modal_motion.probe_client.time.monotonic',side_effect=[1,3]):
            _http_exchange(send,ORIGIN,'/submit','POST',{},b'{}',1,2)
        connection.connect.assert_called_once();connection.request.assert_not_called()
        self.assertEqual(json.loads(send.send_bytes.call_args.args[0])['error'],'STAGING_TRANSPORT_UNAVAILABLE')

    def test_scoped_permit_rejects_missing_refs_wrong_hash_bool_or_expired(self):
        permits=[True,LivePermit('wrong',time.time()+10,'x','x','x','x'),
            LivePermit('wrong',time.time()-1,'x','x','x','x')]
        for permit in permits:
            client,transport,p,_=self.client(authorizer=lambda *args:permit)
            with self.assertRaises(ProbeClientError):client.submit(p,IMAGE)
            transport.exchange.assert_not_called()
        client,transport,p,_=self.client(authorizer=lambda s,*a:LivePermit(payload_digest(s),time.time()+1,'','','',''))
        with self.assertRaises(ProbeClientError):client.submit(p,IMAGE)
        transport.exchange.assert_not_called()

    def test_budget_types_nonfinite_time_and_caps_rejected(self):
        for kwargs in [dict(post=True),dict(total=129),dict(post=-1),dict(seconds=math.inf),
            dict(timeout=math.nan),dict(timeout=11),dict(seconds=0),dict(total=30,post=1,get=1)]:
            with self.subTest(kwargs=kwargs),self.assertRaises(ProbeClientError):RequestBudget(**kwargs)

    def test_every_failed_attempt_consumes_budget_without_retry_or_refund(self):
        client,transport,p,_=self.client(budget=RequestBudget(post=1,get=1,total=2))
        transport.exchange.side_effect=TimeoutError('fixture-secret/private URL must not escape')
        result=client.submit(p,IMAGE)
        self.assertTrue(result['acceptance_unknown']);self.assertEqual(result['attempts'],1)
        with self.assertRaisesRegex(ProbeClientError,'CAP_REACHED'):client.submit(p,IMAGE)
        transport.exchange.assert_called_once();self.assertEqual(client.budget.used['POST'],1)
        self.assertNotIn('fixture-secret',json.dumps(client.records))

    def test_redirect_and_malformed_acceptance_remain_unknown_without_resubmit(self):
        for response in [{'status':302,'body':''},{'status':200,'body':base64.b64encode(b'{bad').decode()},
            {'status':200,'body':base64.b64encode(b'x'*32769).decode()}]:
            client,transport,p,_=self.client();transport.exchange.return_value=response
            record=client.submit(p,IMAGE)
            self.assertTrue(record['acceptance_unknown']);transport.exchange.assert_called_once()
            self.assertIsNone(record.get('receipt_digest'))

    def test_recovery_is_lookup_only_even_when_server_says_not_found(self):
        client,transport,p,value=self.client(recovery_only=True)
        value.pop('job_id');value['status']='not_found'
        transport.exchange.return_value={'status':200,'body':base64.b64encode(json.dumps(value).encode()).decode()}
        self.assertEqual(client.lookup(p['generation_job_id'])['outcome'],'NOT_FOUND')
        with self.assertRaisesRegex(ProbeClientError,'GET_ONLY'):client.submit(p,IMAGE)
        self.assertEqual(transport.exchange.call_count,1)
        self.assertEqual(transport.exchange.call_args.args[2],'GET')

    def test_prepared_payload_scope_and_lookup_path_cannot_be_changed(self):
        client,transport,p,_=self.client()
        for bad in [{**p,'prompt':'An unapproved new creative request'},
                    {**p,'admission_token':'do-not-leak'}, {**p,'generation_job_id':uid(123)}]:
            with self.assertRaises(ProbeClientError):client.submit(bad,IMAGE)
        with self.assertRaises(ProbeClientError):client.lookup('../submit?secret=private')
        transport.exchange.assert_not_called()

    def test_metadata_tampering_and_cross_job_receipt_replay_are_rejected(self):
        p=payload(10031);q=payload(10032)
        client,transport,_,value=self.client(request_hashes={p['generation_job_id']:payload_digest(p),q['generation_job_id']:payload_digest(q)})
        self.assertEqual(client.submit(p,IMAGE)['outcome'],'PROCESSING')
        replay=client.submit(q,IMAGE);self.assertEqual(replay['outcome'],'INVALID_RESPONSE')
        for change in [{'protocol':True},{'synthetic':False},{'run_id':uid(1000)},
                       {'job_id':'fc-real-provider'},{'worker_id':'local-forged'}]:
            client,transport,p,value=self.client()
            bad={**value,**change}
            transport.exchange.return_value={'status':200,'body':base64.b64encode(json.dumps(bad).encode()).decode()}
            self.assertEqual(client.submit(p,IMAGE)['outcome'],'INVALID_RESPONSE')

    def test_recording_redacts_headers_payload_and_raw_error_bodies(self):
        client,transport,p,_=self.client()
        transport.exchange.return_value={'status':503,'body':base64.b64encode(b'fixture-secret raw prompt').decode()}
        client.submit(p,IMAGE);rendered=json.dumps(client.records)
        for secret in ['fixture-secret',p['prompt'],'Authorization','image_base64','Modal-Secret']:
            self.assertNotIn(secret,rendered)
        self.assertNotIn('fixture-probe',repr(client.credentials))

    def test_conflicting_receipt_never_replaces_known_job_binding(self):
        client,transport,p,value=self.client()
        first=client.submit(p,IMAGE)
        value['job_id']='fc-staging-'+'b'*32
        transport.exchange.return_value={'status':200,'body':base64.b64encode(json.dumps(value).encode()).decode()}
        conflict=client.submit(p,IMAGE)
        self.assertEqual(conflict['outcome'],'INVALID_RESPONSE');self.assertTrue(conflict['acceptance_unknown'])
        self.assertEqual(client.budget.jobs[p['generation_job_id']],first['receipt_digest'])

    def test_request_ids_are_unique_and_cannot_be_replayed(self):
        client,transport,p,_=self.client();request_id=uid(888)
        result=client.submit(p,IMAGE,request_id=request_id)
        self.assertEqual(result['request_id'],request_id)
        with self.assertRaisesRegex(ProbeClientError,'ID_REPLAY'):client.submit(p,IMAGE,request_id=request_id)
        transport.exchange.assert_called_once()

    def test_scope_callback_cannot_mutate_client_caps_or_prepared_hashes(self):
        def mutate(scope,*args):
            scope['limits']['POST']=100000;scope['request_hashes'].clear()
            return LivePermit(payload_digest(scope),time.time()+1,'x','x','x','x')
        client,transport,p,_=self.client(authorizer=mutate)
        with self.assertRaises(ProbeClientError):client.submit(p,IMAGE)
        self.assertEqual(client.budget.limits['POST'],4);self.assertEqual(len(client.request_hashes),1)
        transport.exchange.assert_not_called()

    def test_expired_transport_creates_no_pipe_or_child(self):
        with patch('providers.modal_motion.probe_client.multiprocessing.get_context') as context:
            result=ProcessTransport().exchange(ORIGIN,'/submit','POST',{},b'{}',1,deadline=time.monotonic()-1)
        self.assertIsNone(result['status']);context.assert_not_called()

    def test_spawn_failure_closes_both_pipe_endpoints(self):
        receive,send=MagicMock(),MagicMock();process=MagicMock();process.pid=None
        process.start.side_effect=RuntimeError('synthetic spawn refusal')
        context=MagicMock();context.Pipe.return_value=(receive,send);context.Process.return_value=process
        with patch('providers.modal_motion.probe_client.multiprocessing.get_context',return_value=context):
            with self.assertRaises(RuntimeError):
                ProcessTransport().exchange(ORIGIN,'/submit','POST',{},b'{}',1,deadline=time.monotonic()+1)
        receive.close.assert_called_once();send.close.assert_called_once()

    def test_kill_error_is_fatal_and_does_not_expose_raw_exception(self):
        receive,send=MagicMock(),MagicMock();receive.poll.return_value=False
        process=MagicMock();process.pid=123;process.is_alive.return_value=True
        process.kill.side_effect=OSError('private transport detail')
        context=MagicMock();context.Pipe.return_value=(receive,send);context.Process.return_value=process
        with patch('providers.modal_motion.probe_client.multiprocessing.get_context',return_value=context):
            with self.assertRaisesRegex(ProbeClientError,'^STAGING_TRANSPORT_CLEANUP_FAILED$'):
                ProcessTransport().exchange(ORIGIN,'/submit','POST',{},b'{}',1,deadline=time.monotonic()+1)
        receive.close.assert_called();send.close.assert_called()

    def test_concurrent_clients_cannot_exceed_shared_atomic_request_cap(self):
        client,transport,p,_=self.client(budget=RequestBudget(post=1,get=0,total=1))
        def attempt(_):
            try:client.submit(p,IMAGE);return True
            except ProbeClientError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            self.assertEqual(sum(pool.map(attempt,range(20))),1)
        transport.exchange.assert_called_once();self.assertEqual(client.budget.used['total'],1)

    def test_fatal_transport_cleanup_failure_aborts_shared_campaign_budget(self):
        client,transport,p,_=self.client()
        transport.exchange.side_effect=ProbeClientError('STAGING_TRANSPORT_CLEANUP_FAILED')
        with self.assertRaisesRegex(ProbeClientError,'CLEANUP_FAILED'):client.submit(p,IMAGE)
        with self.assertRaisesRegex(ProbeClientError,'CAMPAIGN_ABORTED'):client.lookup(p['generation_job_id'])
        self.assertEqual(transport.exchange.call_count,1)
        self.assertEqual(client.records[-1]['outcome'],'FATAL_CLEANUP_FAILURE')
