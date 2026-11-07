"""No network/GPU: permanent-ledger transport must never invent a grant."""
import io
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch,MagicMock
from providers.modal_motion.admission import PostgresReceiptStore
from providers.modal_motion.contracts import MotionContractError
from providers.modal_motion.tests.test_submit_concurrency import worker_runtime,body,IMAGE

JOB=body()['payload']['generation_job_id']

class Reply(io.BytesIO):
    status=200


class AdmissionTransportTests(unittest.TestCase):
    def store(self,raw=b'true',error=None,status=200):
        opener=MagicMock()
        def open_reply(*args,**kwargs):
            if error:raise error
            reply=Reply(raw);reply.status=status;return reply
        opener.open.side_effect=open_reply
        return PostgresReceiptStore('https://fixture-project.supabase.co','fixture-private-key',opener),opener

    def test_single_bounded_authenticated_rpc_without_retry_or_redirect(self):
        store,opener=self.store()
        self.assertIs(store.put(JOB,{'fingerprint':'f'*64},True),True)
        request=opener.open.call_args.args[0]
        self.assertEqual(request.full_url,'https://fixture-project.supabase.co/rest/v1/rpc/modal_motion_admission')
        self.assertEqual(opener.open.call_args.kwargs['timeout'],10)
        self.assertEqual(json.loads(request.data)['p_operation'],'reserve')
        self.assertNotIn('fixture-private-key',request.full_url)
        self.assertNotIn('fixture-private-key',request.data.decode())
        opener.open.assert_called_once()

    def test_timeout_malformed_oversized_nonboolean_or_redirect_reply_never_grants(self):
        for kwargs in [{'error':TimeoutError('private-key-in-network-error')},{'raw':b'{broken'},
          {'raw':b'"true"'},{'raw':b'1'},{'raw':b'{"granted":true}'},{'raw':b'x'*32769},{'status':302}]:
            with self.subTest(kwargs=list(kwargs)):
                store,opener=self.store(**kwargs)
                with self.assertRaises(MotionContractError) as caught:store.put(JOB,{},True)
                self.assertNotIn('private-key',str(caught.exception));opener.open.assert_called_once()

    def test_unsafe_origins_and_missing_credentials_fail_before_transport(self):
        for url in ['http://fixture.supabase.co','https://127.0.0.1','https://fixture.supabase.co:bad',
          'https://user:secret@fixture.supabase.co','https://evil.invalid','https://fixture.supabase.co/path']:
            with self.assertRaisesRegex(MotionContractError,'CONFIGURATION_INVALID'):
                PostgresReceiptStore(url,'fixture')
        with self.assertRaises(MotionContractError):PostgresReceiptStore('https://fixture.supabase.co','')

    def test_lookup_and_execution_use_distinct_rpc_operations(self):
        store,opener=self.store(raw=b'null');self.assertIsNone(store.get(JOB))
        self.assertEqual(json.loads(opener.open.call_args.args[0].data)['p_operation'],'lookup')
        store,opener=self.store();self.assertTrue(store.put('execution:'+JOB,{},True))
        args=json.loads(opener.open.call_args.args[0].data)
        self.assertEqual(args['p_operation'],'begin');self.assertTrue(args['p_execution'])

    def test_ledger_outage_blocks_submission_and_model_entry(self):
        spawn=MagicMock(return_value=SimpleNamespace(object_id='fc-never'))
        worker=worker_runtime(None,spawn)
        worker._submission_receipts=lambda:self.store(error=TimeoutError())[0]
        with self.assertRaisesRegex(MotionContractError,'LEDGER_UNAVAILABLE'):
            worker._reserve_motion(body()['payload'],IMAGE,body()['ack'])
        spawn.assert_not_called()
        with self.assertRaisesRegex(MotionContractError,'LEDGER_UNAVAILABLE'):
            worker.single_motion_proof({**body()['payload'],'admission_token':JOB},IMAGE,body()['ack'])
        spawn.assert_not_called()

    def test_missing_protocol_rejected_before_admission_or_gpu(self):
        spawn=MagicMock();worker=worker_runtime(None,spawn)
        worker._submission_receipts=MagicMock(side_effect=AssertionError('No ledger access expected'))
        old=body()['payload'];del old['admission_protocol']
        with self.assertRaisesRegex(MotionContractError,'PROTOCOL_REQUIRED'):
            worker._reserve_motion(old,IMAGE,body()['ack'])
        with self.assertRaisesRegex(MotionContractError,'PROTOCOL_REQUIRED'):
            worker.single_motion_proof(old,IMAGE,body()['ack'])
        spawn.assert_not_called();worker._submission_receipts.assert_not_called()

    def test_real_production_factory_uses_postgresql_and_never_modal_dict(self):
        worker=worker_runtime(None,MagicMock())
        worker.modal.Dict.from_name=MagicMock(side_effect=AssertionError('Expiring authority forbidden'))
        with patch.dict(os.environ,{'SUPABASE_URL':'https://fixture.supabase.co','SUPABASE_SERVICE_ROLE_KEY':'fixture-only'}):
            store=worker._production_submission_receipts()
        self.assertIsInstance(store,PostgresReceiptStore)
        worker.modal.Dict.from_name.assert_not_called()
