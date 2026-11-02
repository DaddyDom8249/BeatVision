"""Executable proposal tests. Every service and provider below is a local fake."""
import copy
import json
import multiprocessing
import os
import pathlib
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

from providers.modal_motion.tests.staging_control_model import (
    Refused,ModelDecision,MockWitness,PolicyModel,OperationLedger,MockRemote,RemoteFaultModel,digest)
from providers.modal_motion.probe_client import Credentials,ProbeClientError,RequestBudget,StagingHTTPClient

NOW=1000.0
JOB='00000000-0000-0000-0000-000000010031'
RUN='00000000-0000-0000-0000-000000000999'


def fixture(updates=None):
    manifest={'owner_id':'owner-fixture','account_id':'account-fixture','workspace_id':'workspace-fixture',
        'environment':'bragoraforge-protocol2-staging','app_id':'ap-fixture','function_id':'fu-fixture',
        'deployment_id':'de-fixture','origin':'https://fixture--protocol2.modal.run',
        'source_commit':'a'*40,'image_digest':'b'*64,'database_id':'db-fixture','run_id':RUN,
        'fixtures':{JOB:{'request_digest':'c'*64,'snapshot_digest':'d'*64,'provenance_digest':'e'*64}},
        'limits':{'POST':2,'GET':2,'total':4,'CONTROL':1},'expires_utc':1060.0,'observe_until_utc':1120.0}
    manifest.update(updates or {})
    facts={
        'approval':{'owner_id':manifest['owner_id'],'audience':'protocol2-staging',
            'actions':['POST','GET','CONTROL','OBSERVE','deploy','teardown'],'revoked':False},
        'account':{'account_id':manifest['account_id'],'workspace_id':manifest['workspace_id'],
            'provider_enforced':True,'paid_overage_limit':0,'credit_only':True,'reserved_manifest':digest(manifest)},
        'deployment':{**{key:manifest[key] for key in ['account_id','workspace_id','environment','app_id',
            'function_id','deployment_id','origin','source_commit','image_digest']},
            'cpu_only':True,'max_containers':2,'max_inputs':1,'production':False},
        'database':{'database_id':manifest['database_id'],'run_id':manifest['run_id'],'owner_id':manifest['owner_id'],
            'production':False,'isolated':True,'rls':True,'retained_history':True,'restore_verified':True,
            'automations_off':True,'old_paths_disabled':True,'approved_media':True,'immutable_snapshots':True,
            'provenance_valid':True,'approved_fixtures':copy.deepcopy(manifest['fixtures'])},
        'access':{**{key:manifest[key] for key in ['owner_id','account_id','workspace_id','app_id','function_id','deployment_id']},
            'scope_enforced':True,'target_task_id':'ta-fixture',
            'permissions':['probe_http','observe_task','stop_exact_task','read_fixture_evidence']}}
    clock=[NOW]
    witnesses={key:MockWitness(key,digest(manifest),value,lambda:clock[0]) for key,value in facts.items()}
    policy=PolicyModel(manifest,witnesses,lambda:clock[0])
    return manifest,witnesses,policy,clock


def boundary(manifest,phase='after_begin'):
    fenced=phase not in ('after_reserve','after_acceptance')
    return {'owner_id':manifest['owner_id'],'run_id':manifest['run_id'],'job_id':JOB,'phase':phase,'revision':1,
        'task_id':'ta-fixture','request_id':str(uuid.uuid4()),'nonce':'f'*64,'paused':True,
        'incarnation':'2'*64,'pause_expires_utc':manifest['expires_utc'],
        **manifest['fixtures'][JOB],'admission_present':True,'execution_fenced':fenced,
        'receipt_digest':'1'*64 if fenced else None,
        'receipt_persisted':phase in ('after_receipt','after_model_start','before_http_reply'),
        'counts':{'spawn_attempts':int(phase!='after_reserve'),
            'fake_model_starts':int(phase in ('after_model_start','before_http_reply')),
            'fake_completions':int(phase=='before_http_reply')}}


def setup_remote(directory,phase='after_begin'):
    manifest,witnesses,policy,clock=fixture()
    remote=MockRemote(manifest,boundary(manifest,phase),lambda:clock[0])
    ledger=OperationLedger(pathlib.Path(directory)/'operations.sqlite')
    model=RemoteFaultModel(policy,ledger,remote)
    return manifest,witnesses,policy,clock,remote,ledger,model


def model_worker(ledger_path,before,provider_log,crash=None):
    manifest,_,policy,clock=fixture();remote=MockRemote(manifest,before,lambda:clock[0]);remote.calls_path=provider_log
    model=RemoteFaultModel(policy,OperationLedger(ledger_path),remote)
    try:model.stop_at_boundary(JOB,'after_begin',crash=crash)
    except Refused as exc:
        if str(exc)=='SIMULATED_CONTROLLER_CRASH':os._exit(42)
        raise


class AuthorizationModelTests(unittest.TestCase):
    def test_missing_empty_and_nonstrings_cannot_define_identity(self):
        for field in ['owner_id','account_id','workspace_id','app_id','function_id','deployment_id','database_id']:
            for value in [None,'',[],False]:
                with self.subTest(field=field,value=value),self.assertRaises(Refused):
                    _,_,policy,_=fixture({field:value});policy.evaluate(policy.scope(),'POST',JOB)

    def test_all_independent_mock_witnesses_allow_only_model_decision(self):
        manifest,witnesses,policy,_=fixture()
        decision=policy.evaluate(policy.scope(),'POST',JOB)
        self.assertIs(type(decision),ModelDecision);self.assertEqual(decision.scope,'OFFLINE_MODEL_ONLY')
        self.assertEqual({x.calls for x in witnesses.values()},{1})
        self.assertEqual(decision.manifest_digest,digest(manifest))

    def test_reference_strings_and_environment_flags_cannot_supply_evidence(self):
        manifest,witnesses,policy,_=fixture()
        for key in witnesses:
            with self.subTest(domain=key),self.assertRaises(Refused):
                PolicyModel(manifest,{**witnesses,key:'approved-reference'}).evaluate(policy.scope(),'POST',JOB)

    def test_mismatched_subjects_deployment_database_and_ownership_are_rejected(self):
        cases=[('approval','owner_id'),('approval','audience'),('account','account_id'),('account','workspace_id'),
            ('deployment','app_id'),('deployment','function_id'),('deployment','deployment_id'),
            ('deployment','environment'),('deployment','origin'),('deployment','source_commit'),
            ('deployment','image_digest'),('database','database_id'),('database','run_id'),
            ('database','owner_id'),('access','app_id'),('access','function_id'),('access','owner_id')]
        for domain,key in cases:
            _,witnesses,policy,_=fixture();witnesses[domain].facts[key]='forged'
            with self.subTest(domain=domain,key=key),self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)

    def test_false_or_nonboolean_safety_gates_are_rejected(self):
        cases=[('approval','revoked',True),('account','provider_enforced',False),('account','credit_only',False),
            ('account','paid_overage_limit',1),('account','paid_overage_limit',True),
            ('deployment','production',True),('deployment','cpu_only',False),('deployment','max_inputs',2),
            ('deployment','max_containers',3),('database','production',True),('database','isolated',False),
            ('database','rls',1),('database','retained_history',False),('database','restore_verified',False),
            ('database','automations_off',False),('database','old_paths_disabled',False),
            ('database','approved_media',False),('database','immutable_snapshots',False),
            ('database','provenance_valid',False),('access','scope_enforced',1)]
        for domain,key,value in cases:
            _,witnesses,policy,_=fixture();witnesses[domain].facts[key]=value
            with self.subTest(domain=domain,key=key),self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)

    def test_available_credit_without_bound_provider_enforcement_is_insufficient(self):
        _,witnesses,policy,_=fixture();witnesses['account'].facts['reserved_manifest']='wrong'
        witnesses['account'].facts['available_credits']=1000
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)

    def test_expired_stale_future_wrong_issuer_and_replayed_challenge_are_rejected(self):
        for mutation in [dict(expires_utc=999),dict(observed_utc=994),dict(observed_utc=1001),
            dict(issuer='self-issued'),dict(key_id='unknown-key'),dict(challenge='previous-request'),dict(manifest_digest='bad')]:
            _,witnesses,policy,_=fixture();witnesses['approval'].corrupt=mutation
            with self.subTest(mutation=mutation),self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)

    def test_scope_fixture_input_and_permission_expansion_are_rejected(self):
        _,witnesses,policy,_=fixture()
        for key,value in [('source_commit','b'*40),('origin','https://evil.modal.run'),('expires_utc',1200)]:
            bad={**policy.scope(),key:value}
            with self.subTest(key=key),self.assertRaises(Refused):policy.evaluate(bad,'POST',JOB)
        witnesses['database'].facts['approved_fixtures'][JOB]['snapshot_digest']='changed'
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)
        _,witnesses,policy,_=fixture();witnesses['access'].facts['permissions'].append('*')
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'CONTROL',JOB)

    def test_revocation_and_cross_purpose_use_are_checked_every_time(self):
        _,witnesses,policy,_=fixture();policy.evaluate(policy.scope(),'POST',JOB)
        witnesses['approval'].facts['revoked']=True
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)
        _,witnesses,policy,_=fixture();witnesses['approval'].facts['actions']=['GET']
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'CONTROL',JOB)
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'delete-app',JOB)

    def test_expiry_keeps_separately_authorized_observation_read_only(self):
        _,_,policy,clock=fixture();clock[0]=1061
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'CONTROL',JOB)
        self.assertEqual(policy.evaluate(policy.scope(),'OBSERVE',JOB).scope,'OFFLINE_MODEL_ONLY')
        clock[0]=1120
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'OBSERVE',JOB)

    def test_positive_model_cannot_authorize_real_http_client(self):
        manifest,_,policy,_=fixture();transport=MagicMock()
        budget=RequestBudget(post=2,get=2,total=4);budget.expires_utc=manifest['expires_utc']
        client=StagingHTTPClient(manifest['origin'],manifest['origin'],'https://production.modal.run',RUN,
            manifest['source_commit'],{JOB:manifest['fixtures'][JOB]['request_digest']},
            Credentials('fixture-bearer-at-least-32-characters','fixture-key','fixture-secret'),budget,
            authorizer=policy.evaluate,transport=transport)
        with self.assertRaisesRegex(ProbeClientError,'NOT_AUTHORIZED'):client.lookup(JOB)
        transport.exchange.assert_not_called()

    def test_unavailable_or_malformed_evidence_is_sanitized_and_fails_closed(self):
        _,witnesses,policy,_=fixture();witnesses['database'].failure=RuntimeError('Bearer secret/private URL')
        with self.assertRaisesRegex(Refused,'^MODEL_EVIDENCE_UNAVAILABLE$'):policy.evaluate(policy.scope(),'POST',JOB)

    def test_request_budget_is_atomic_retained_and_replays_are_not_granted_again(self):
        _,_,policy,_=fixture()
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'budget.sqlite';ledger=OperationLedger(path)
            request_id=str(uuid.uuid4());policy.reserve_request(policy.scope(),'POST',JOB,request_id,ledger)
            with self.assertRaisesRegex(Refused,'REPLAY'):
                policy.reserve_request(policy.scope(),'POST',JOB,request_id,OperationLedger(path))
            def acquire(_):
                try:policy.reserve_request(policy.scope(),'POST',JOB,str(uuid.uuid4()),OperationLedger(path));return True
                except Refused:return False
            with ThreadPoolExecutor(max_workers=12) as pool:self.assertEqual(sum(pool.map(acquire,range(12))),1)
            for _ in range(2):policy.reserve_request(policy.scope(),'GET',JOB,str(uuid.uuid4()),OperationLedger(path))
            with self.assertRaisesRegex(Refused,'BUDGET'):
                policy.reserve_request(policy.scope(),'GET',JOB,str(uuid.uuid4()),OperationLedger(path))

    def test_changing_a_manifest_does_not_reset_an_existing_run_budget(self):
        _,_,policy,_=fixture()
        with tempfile.TemporaryDirectory() as directory:
            ledger=OperationLedger(pathlib.Path(directory)/'budget.sqlite')
            policy.reserve_request(policy.scope(),'POST',JOB,str(uuid.uuid4()),ledger)
            _,_,changed,_=fixture({'limits':{'POST':3,'GET':2,'total':5,'CONTROL':1}})
            with self.assertRaisesRegex(Refused,'RUN_SCOPE_CHANGED'):
                changed.reserve_request(changed.scope(),'POST',JOB,str(uuid.uuid4()),ledger)

    def test_witness_collection_cannot_outlive_its_first_proof(self):
        _,witnesses,policy,clock=fixture()
        original=witnesses['access'].read
        def delayed(challenge):
            proof=original(challenge);clock[0]+=6;return proof
        witnesses['access'].read=delayed
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)

    def test_revocation_after_durable_request_debit_does_not_refund_or_issue_a_decision(self):
        _,witnesses,policy,_=fixture()
        with tempfile.TemporaryDirectory() as directory:
            ledger=OperationLedger(pathlib.Path(directory)/'budget.sqlite');original=ledger.reserve_request
            def revoke(*args):
                original(*args);witnesses['approval'].facts['revoked']=True
            ledger.reserve_request=revoke;request_id=str(uuid.uuid4())
            with self.assertRaises(Refused):policy.reserve_request(policy.scope(),'POST',JOB,request_id,ledger)
            witnesses['approval'].facts['revoked']=False;ledger.reserve_request=original
            with self.assertRaisesRegex(Refused,'REPLAY'):
                policy.reserve_request(policy.scope(),'POST',JOB,request_id,ledger)

    def test_backward_clock_cannot_reopen_an_expired_authority_in_the_model(self):
        _,_,policy,clock=fixture();clock[0]=1061
        with self.assertRaises(Refused):policy.evaluate(policy.scope(),'POST',JOB)
        clock[0]=1001
        with self.assertRaisesRegex(Refused,'CLOCK_REWOUND'):policy.evaluate(policy.scope(),'POST',JOB)


class RemoteFaultModelTests(unittest.TestCase):
    def test_final_identity_read_cannot_outlive_proof_or_authority_before_dispatch(self):
        for delay in [6,61]:
            with self.subTest(delay=delay),tempfile.TemporaryDirectory() as directory:
                _,_,_,clock,remote,ledger,model=setup_remote(directory)
                original=remote.observe;calls=[0]
                def delayed(challenge):
                    proof=original(challenge);calls[0]+=1
                    if calls[0]==2:clock[0]+=delay
                    return proof
                remote.observe=delayed
                with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
                self.assertEqual(remote.stop_calls,[]);self.assertEqual(ledger.count(),1)

    def test_final_checkpoint_read_cannot_outlive_observation_proofs_before_finish(self):
        for delay in [6,121]:
            with self.subTest(delay=delay),tempfile.TemporaryDirectory() as directory:
                _,_,_,clock,remote,ledger,model=setup_remote(directory)
                operation=model.stop_at_boundary(JOB,'after_begin');remote.finish()
                original=remote.checkpoints.read
                def delayed(challenge,after=False):
                    proof=original(challenge,after)
                    if after:clock[0]+=delay
                    return proof
                remote.checkpoints.read=delayed
                with self.assertRaises(Refused):model.reconcile(operation['operation_id'])
                self.assertEqual(ledger.get(operation['operation_id'])['state'],'STOP_UNKNOWN')
                self.assertEqual(len(remote.stop_calls),1)

    def test_new_run_never_reclaims_the_same_uncertain_task_incarnation(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest,_,_,_,remote,ledger,model=setup_remote(directory)
            model.stop_at_boundary(JOB,'after_begin')
            changed,_,policy,clock=fixture({'run_id':str(uuid.uuid4())})
            next_boundary={**remote.before,'run_id':changed['run_id'],'nonce':'3'*64}
            another=MockRemote(changed,next_boundary,lambda:clock[0])
            with self.assertRaises(Refused):RemoteFaultModel(policy,OperationLedger(ledger.path),another).stop_at_boundary(JOB,'after_begin')
            self.assertEqual(another.stop_calls,[]);self.assertEqual(ledger.count(),1)

    def test_each_of_seven_boundaries_requires_its_own_durable_state(self):
        for phase in ['after_reserve','after_acceptance','after_begin','before_receipt',
            'after_receipt','after_model_start','before_http_reply']:
            with self.subTest(phase=phase),tempfile.TemporaryDirectory() as directory:
                *_,remote,_,model=setup_remote(directory,phase)
                self.assertEqual(model.stop_at_boundary(JOB,phase)['state'],'STOP_UNKNOWN')
                self.assertEqual(len(remote.stop_calls),1)

    def test_acknowledgment_alone_is_not_death_or_boundary_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory)
            operation=model.stop_at_boundary(JOB,'after_begin')
            self.assertEqual(operation['state'],'STOP_UNKNOWN');self.assertEqual(len(remote.stop_calls),1)
            self.assertEqual(model.reconcile(operation['operation_id'])['state'],'STOP_UNKNOWN')

    def test_lost_reply_and_restart_never_dispatch_another_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory);remote.lose_reply=True
            operation=model.stop_at_boundary(JOB,'after_begin')
            restarted=RemoteFaultModel(model.policy,OperationLedger(ledger.path),remote)
            self.assertEqual(restarted.stop_at_boundary(JOB,'after_begin')['operation_id'],operation['operation_id'])
            self.assertEqual(len(remote.stop_calls),1)

    def test_controller_crashes_before_and_after_dispatch_retain_claim(self):
        for point in ['after_claim','after_dispatch']:
            with self.subTest(point=point),tempfile.TemporaryDirectory() as directory:
                *_,remote,ledger,model=setup_remote(directory)
                with self.assertRaisesRegex(Refused,'SIMULATED_CONTROLLER_CRASH'):
                    model.stop_at_boundary(JOB,'after_begin',crash=point)
                restarted=RemoteFaultModel(model.policy,OperationLedger(ledger.path),remote)
                self.assertEqual(restarted.stop_at_boundary(JOB,'after_begin')['state'],'STOP_UNKNOWN')
                self.assertEqual(len(remote.stop_calls),int(point=='after_dispatch'))

    def test_concurrent_controllers_dispatch_one_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory)
            def attempt(_):return RemoteFaultModel(model.policy,OperationLedger(ledger.path),remote).stop_at_boundary(JOB,'after_begin')
            with ThreadPoolExecutor(max_workers=12) as pool:results=list(pool.map(attempt,range(12)))
            self.assertEqual(len(remote.stop_calls),1)
            self.assertEqual(len({r['operation_id'] for r in results}),1)

    def test_independent_process_controllers_append_exactly_one_fake_provider_call(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest,_,_,_=fixture();before=boundary(manifest)
            path=str(pathlib.Path(directory)/'operations.sqlite');log=str(pathlib.Path(directory)/'provider.log')
            context=multiprocessing.get_context('spawn')
            processes=[context.Process(target=model_worker,args=(path,before,log)) for _ in range(8)]
            try:
                for process in processes:process.start()
                for process in processes:
                    process.join(10);self.assertEqual(process.exitcode,0)
                calls=pathlib.Path(log).read_text().splitlines()
                self.assertEqual(len(calls),1);self.assertEqual(OperationLedger(path).count(),1)
            finally:
                for process in processes:
                    if process.pid is not None and process.is_alive():process.kill();process.join(2)

    def test_actual_controller_process_exit_retains_before_and_after_dispatch_holds(self):
        for phase in ['after_claim','after_dispatch']:
            with self.subTest(phase=phase),tempfile.TemporaryDirectory() as directory:
                manifest,_,policy,clock=fixture();before=boundary(manifest)
                path=str(pathlib.Path(directory)/'operations.sqlite');log=pathlib.Path(directory)/'provider.log'
                process=multiprocessing.get_context('spawn').Process(target=model_worker,args=(path,before,str(log),phase))
                process.start();process.join(10)
                if process.is_alive():process.kill();process.join(2)
                self.assertEqual(process.exitcode,42)
                remote=MockRemote(manifest,before,lambda:clock[0]);remote.calls_path=str(log)
                model=RemoteFaultModel(policy,OperationLedger(path),remote)
                self.assertEqual(model.stop_at_boundary(JOB,'after_begin')['state'],'STOP_UNKNOWN')
                self.assertEqual(len(log.read_text().splitlines()) if log.exists() else 0,int(phase=='after_dispatch'))

    def test_unsupported_sigint_reschedule_and_graceful_stop_are_rejected(self):
        for semantics in ['sigint_reschedule','graceful','unknown']:
            with self.subTest(semantics=semantics),tempfile.TemporaryDirectory() as directory:
                *_,remote,_,model=setup_remote(directory);remote.task['stop_semantics']=semantics
                with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
                self.assertEqual(remote.stop_calls,[])

    def test_incomplete_wrong_task_function_workspace_deployment_and_scope_are_rejected(self):
        for field in ['task_id','app_id','function_id','deployment_id','workspace_id','account_id',
            'environment','source_commit','image_digest','incarnation','control_scope_task',
            'generation_job_id','request_digest','receipt_digest','only_input']:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as directory:
                *_,remote,_,model=setup_remote(directory);remote.task[field]='forged'
                with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
                self.assertEqual(remote.stop_calls,[])

    def test_forged_unpaused_stale_or_cross_owner_boundary_is_rejected(self):
        for field,value in [('owner_id','other-owner'),('run_id',str(uuid.uuid4())),('revision',True),
            ('paused',False),('request_digest','changed'),('snapshot_digest','changed'),
            ('provenance_digest','changed'),('nonce','old'),('pause_expires_utc',NOW),
            ('receipt_digest',None),('execution_fenced',False)]:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as directory:
                *_,remote,_,model=setup_remote(directory);remote.before[field]=value
                with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
                self.assertEqual(remote.stop_calls,[])

    def test_replayed_or_stale_provider_and_private_checkpoint_witnesses_are_rejected(self):
        for channel in ['provider','checkpoint']:
            for change in [dict(challenge='replay'),dict(issuer='caller-header'),dict(observed_utc=994),dict(expires_utc=999)]:
                with self.subTest(channel=channel,change=change),tempfile.TemporaryDirectory() as directory:
                    *_,remote,_,model=setup_remote(directory)
                    if channel=='provider':remote.corrupt_identity=change
                    else:remote.checkpoints.corrupt=change
                    with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
                    self.assertEqual(remote.stop_calls,[])

    def test_control_limit_and_reused_pause_nonce_are_never_regranted(self):
        for limit in [1,7]:
            with self.subTest(limit=limit),tempfile.TemporaryDirectory() as directory:
                manifest,witnesses,policy,clock=fixture({'limits':{'POST':2,'GET':2,'total':4,'CONTROL':limit}})
                before=boundary(manifest);ledger=OperationLedger(pathlib.Path(directory)/'operations.sqlite')
                remote=MockRemote(manifest,before,lambda:clock[0]);RemoteFaultModel(policy,ledger,remote).stop_at_boundary(JOB,'after_begin')
                before['task_id']='ta-another';before['request_id']=str(uuid.uuid4())
                witnesses['access'].facts['target_task_id']='ta-another'
                another=MockRemote(manifest,before,lambda:clock[0])
                with self.assertRaises(Refused):RemoteFaultModel(policy,ledger,another).stop_at_boundary(JOB,'after_begin')
                self.assertEqual(another.stop_calls,[]);self.assertEqual(ledger.count(),1)

    def test_permission_for_a_different_task_is_not_a_stop_grant(self):
        with tempfile.TemporaryDirectory() as directory:
            _,witnesses,_,_,remote,ledger,model=setup_remote(directory)
            witnesses['access'].facts['target_task_id']='ta-other'
            with self.assertRaisesRegex(Refused,'TASK_PERMISSION'):model.stop_at_boundary(JOB,'after_begin')
            self.assertEqual(remote.stop_calls,[]);self.assertEqual(ledger.count(),0)

    def test_identity_or_paused_row_change_after_claim_prevents_dispatch(self):
        for mutate in ['boundary','identity']:
            with self.subTest(mutate=mutate),tempfile.TemporaryDirectory() as directory:
                *_,remote,_,model=setup_remote(directory)
                def change():
                    if mutate=='boundary':remote.before['revision']+=1
                    else:remote.task['deployment_id']='changed'
                with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin',before_dispatch=change)
                self.assertEqual(remote.stop_calls,[])
                self.assertEqual(model.ledger.count(),1)

    def test_database_outage_before_admission_prevents_control(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory);ledger.unavailable=True
            with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
            self.assertEqual(remote.stop_calls,[])

    def test_independent_mock_termination_and_unchanged_ledger_are_required(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,_,model=setup_remote(directory);operation=model.stop_at_boundary(JOB,'after_begin')
            remote.finish()
            verified=model.reconcile(operation['operation_id'])
            self.assertEqual(verified['state'],'MODEL_VERIFIED')
            self.assertEqual(len(remote.stop_calls),1)
            persisted=OperationLedger(model.ledger.path).get(operation['operation_id'])['verification']
            self.assertEqual(persisted['before_digest'],persisted['after_digest'])
            self.assertEqual(persisted['termination']['operation_id'],operation['operation_id'])

    def test_expiry_inside_verification_transaction_rolls_back_the_state_and_proof(self):
        with tempfile.TemporaryDirectory() as directory:
            _,_,_,clock,remote,ledger,model=setup_remote(directory)
            operation=model.stop_at_boundary(JOB,'after_begin');remote.finish();original=ledger.connect
            class DelayedWrite:
                def __enter__(self):self.db=original();self.db.__enter__();return self
                def execute(self,statement,*args):
                    result=self.db.execute(statement,*args)
                    if statement.startswith("update controls set state="):clock[0]+=6
                    return result
                def __exit__(self,*args):
                    try:return self.db.__exit__(*args)
                    finally:self.db.close()
            ledger.connect=lambda:DelayedWrite()
            with self.assertRaises(Refused):model.reconcile(operation['operation_id'])
            ledger.connect=original
            row=ledger.get(operation['operation_id'])
            self.assertEqual(row['state'],'STOP_UNKNOWN');self.assertIsNone(row['verification'])
            self.assertEqual(len(remote.stop_calls),1)

    def test_out_of_order_running_observation_cannot_reaffirm_prior_verified_state(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory);operation=model.stop_at_boundary(JOB,'after_begin')
            remote.finish();model.reconcile(operation['operation_id']);remote.task['state']='running'
            with self.assertRaisesRegex(Refused,'OBSERVATION_CONFLICT'):model.reconcile(operation['operation_id'])
            self.assertEqual(len(remote.stop_calls),1)

    def test_negative_oracle_exposes_check_then_stop_target_change(self):
        # This is an UNSAFE counterexample, not a successful fault campaign.
        # A real provider conditional stop/immutable pause has not been found.
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory);original=remote.stop
            def racing_effect(operation,task):
                remote.task['only_input']='unrelated-input-after-final-read'
                return original(operation,task)
            remote.stop=racing_effect
            operation=model.stop_at_boundary(JOB,'after_begin')
            self.assertEqual(len(remote.stop_calls),1)
            self.assertNotEqual(remote.task['only_input'],remote.before['request_id'])
            self.assertEqual(operation['state'],'STOP_UNKNOWN')
            remote.finish()
            with self.assertRaises(Refused):model.reconcile(operation['operation_id'])
            self.assertEqual(ledger.get(operation['operation_id'])['state'],'STOP_UNKNOWN')

    def test_rescheduling_duplicate_events_conflicting_receipts_and_input_drift_hold(self):
        for field in ['rescheduled','new_task','counts','receipt_digest','snapshot_digest','execution_fenced']:
            with self.subTest(field=field),tempfile.TemporaryDirectory() as directory:
                *_,remote,_,model=setup_remote(directory);operation=model.stop_at_boundary(JOB,'after_begin');remote.finish()
                if field=='rescheduled':remote.task['rescheduled']=True
                elif field=='new_task':remote.task['replacement_tasks']=['ta-replacement']
                elif field=='counts':remote.after['counts']['fake_model_starts']+=1
                elif field=='execution_fenced':remote.after[field]=False
                else:remote.after[field]='changed'
                with self.assertRaises(Refused):model.reconcile(operation['operation_id'])
                self.assertEqual(model.ledger.get(operation['operation_id'])['state'],'STOP_UNKNOWN')
                self.assertEqual(len(remote.stop_calls),1)

    def test_termination_persistence_failure_keeps_unknown_and_can_be_observed_later(self):
        with tempfile.TemporaryDirectory() as directory:
            *_,remote,ledger,model=setup_remote(directory);operation=model.stop_at_boundary(JOB,'after_begin');remote.finish()
            ledger.refuse_completion=True
            with self.assertRaises(Refused):model.reconcile(operation['operation_id'])
            self.assertEqual(ledger.get(operation['operation_id'])['state'],'STOP_UNKNOWN')
            ledger.refuse_completion=False
            self.assertEqual(model.reconcile(operation['operation_id'])['state'],'MODEL_VERIFIED')
            self.assertEqual(len(remote.stop_calls),1)

    def test_observation_after_control_expiry_never_sends_another_stop(self):
        with tempfile.TemporaryDirectory() as directory:
            _,_,_,clock,remote,_,model=setup_remote(directory);operation=model.stop_at_boundary(JOB,'after_begin')
            clock[0]=1061;remote.finish()
            with self.assertRaises(Refused):model.stop_at_boundary(JOB,'after_begin')
            self.assertEqual(model.reconcile(operation['operation_id'])['state'],'MODEL_VERIFIED')
            self.assertEqual(len(remote.stop_calls),1)


if __name__=='__main__':unittest.main()
