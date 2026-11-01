"""Offline HTTP acceptance simulation. Local PIDs are never Modal evidence."""
import concurrent.futures
import pathlib
import sqlite3
import time
import uuid

from providers.modal_motion.probe_client import Credentials,RequestBudget,StagingHTTPClient,PRODUCTION_ORIGIN,payload_digest
from providers.modal_motion.probe_crash_controller import CrashController,CrashControllerError
from providers.modal_motion.tests.http_probe_fixture import IMAGE,SQLiteFixture,probe_backend,snapshot

CASE_IDS=('AUTH','HEALTHY','RETRY','LOST_REPLY','CONFLICT','RESERVE_CRASH','BEGIN_CRASH',
    'RECEIPT_CRASH','DB_FAILURE','RESTART_RESTORE','EXPIRY','LEGACY_HOLD','NEGATIVE_ORACLE')
TOKEN='offline-fixture-probe-token-not-a-real-secret'


def one_start_oracle(counts):
    return counts=={'spawn_attempts':1,'fake_model_starts':1,'fake_completions':1}


def campaign(backend,payloads,source_commit,restore=None,evidence=None):
    """Bounded local processes only; asserts invariants independently of HTTP.

    PostgreSQL mode uses the existing CI-only service-role fixture adapter.
    Caller prepares its isolated DB; no cloud setup or credentials are accepted.
    """
    run=backend['run_id'];records=[];cases={};snapshots={}
    budget=RequestBudget(post=64,get=48,total=112,seconds=180,timeout=8)
    evidence={} if evidence is None else evidence
    evidence.update({'requests':records,'cases':cases,'additional_crash_boundaries':snapshots,
        'budget_used':budget.used,'run_id':run,'database_mode':backend['mode'],'scope':'OFFLINE_LOCAL'})
    def job(index):return payloads[index]['generation_job_id']
    def observe(index):return snapshot(backend,job(index))
    def save(case,evidence):cases[case]={'status':'OFFLINE_PASS','evidence':evidence}
    with CrashController(backend,run,TOKEN,lifetime=180) as controller:
        evidence['worker_events']=controller.events
        def client(worker,**options):
            return StagingHTTPClient(worker.permit.origin,worker.permit.origin,PRODUCTION_ORIGIN,
                run,source_commit,backend['request_hashes'],Credentials(options.pop('token',TOKEN)),
                budget,fixture=worker.permit,records=records,**options)
        first=controller.start();second=controller.start()
        before=observe(0)
        denied=client(first,token='incorrect-offline-fixture-token-at-least32').submit(payloads[0],IMAGE)
        assert denied['http_status']==401 and observe(0)==before
        save('AUTH',{'application_status':401,'database_unchanged':True,'proxy_auth':'NOT_VERIFIED'})
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            futures=[pool.submit(client(first if i%2 else second).submit,payloads[0],IMAGE) for i in range(20)]
            replies=[future.result(timeout=20) for future in futures]
        stable=observe(0)
        assert one_start_oracle(stable['counts']),stable
        assert all(r['outcome'] in ('PROCESSING','RECONCILIATION_REQUIRED') for r in replies),replies
        assert {r['worker_id'] for r in replies}=={'local-'+str(first.process.pid),'local-'+str(second.process.pid)}
        assert {r['receipt_digest'] for r in replies if r.get('receipt_digest')}=={stable['receipt_digest']}
        save('HEALTHY',{'clients':20,'owned_worker_pids':[first.process.pid,second.process.pid],**stable})
        retry=client(second).submit(payloads[0],IMAGE)
        assert retry['receipt_digest']==stable['receipt_digest'] and observe(0)==stable
        save('RETRY',{'stable_receipt':True,'database_unchanged':True})

        # Every selected boundary pauses on a private channel after the commit.
        # Killing the stored Process handle precedes a fresh-worker GET/retry.
        boundaries=['after_reserve','after_acceptance','after_begin','before_receipt',
            'after_receipt','after_model_start','before_http_reply']
        for index,boundary in enumerate(boundaries,1):
            worker=controller.start(job_id=job(index),boundary=boundary)
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future=pool.submit(client(worker).submit,payloads[index],IMAGE,request_id=worker.request_id)
                killed=controller.crash_at_boundary(worker)
                lost=future.result(timeout=12)
            assert lost['acceptance_unknown'] and lost['http_status'] is None,lost
            held=observe(index)
            lookup=client(second,recovery_only=True).lookup(job(index))
            explicit_retry=client(first).submit(payloads[index],IMAGE)
            after=observe(index)
            assert held==after,(boundary,held,after)
            assert lookup.get('receipt_digest')==held['receipt_digest']
            assert explicit_retry.get('receipt_digest')==held['receipt_digest']
            expected=(0,0,0) if boundary=='after_reserve' else (1,int(boundary in
                ('after_model_start','before_http_reply')),int(boundary=='before_http_reply'))
            assert tuple(after['counts'][k] for k in ('spawn_attempts','fake_model_starts','fake_completions'))==expected
            snapshots[boundary]={'before_recovery':held,'after_recovery':after,'kill':killed,
                'lookup_outcome':lookup['outcome'],'lost_request_id':lost['request_id']}
            controller.stop(worker)
        save('RESERVE_CRASH',snapshots['after_reserve'])
        save('BEGIN_CRASH',snapshots['after_begin'])
        save('RECEIPT_CRASH',snapshots['after_receipt'])
        save('LOST_REPLY',snapshots['before_http_reply'])

        # Negative payload is deliberately prepared for the *client* but not DB.
        # No bypass exists in the actual worker or production admission ledger.
        conflict_statuses=[]
        for key,value in [('prompt','Conflicting creative request'),('project_id',str(uuid.uuid4()))]:
            bad={**payloads[0],key:value};hashes={**backend['request_hashes'],job(0):payload_digest(bad)}
            attacker=client(second);attacker.request_hashes=hashes
            rejected=attacker.submit(bad,IMAGE)
            # Production store deliberately sanitizes *all* RPC errors to
            # unavailable; the psql opener cannot preserve SQL error classes.
            expected=(503,) if backend['mode']=='postgres_ci_fixture' else (400,409)
            assert rejected['http_status'] in expected and observe(0)==stable,rejected
            conflict_statuses.append(rejected['http_status'])
        save('CONFLICT',{'fingerprint_and_project_rejected':True,'immutable_state_unchanged':True,
            'http_statuses':conflict_statuses,'rpc_errors_sanitized':backend['mode']=='postgres_ci_fixture'})

        outage=controller.start(unavailable=True)
        empty=observe(8);response=client(outage).submit(payloads[8],IMAGE)
        assert response['http_status']==503 and observe(8)==empty
        controller.stop(outage)
        refusal=controller.start(refuse_write='receipt')
        result=client(refusal).submit(payloads[8],IMAGE)
        assert result['http_status']==503,result # Execution-side receipt is durable.
        held=observe(8)
        assert held['counts']=={'spawn_attempts':1,'fake_model_starts':0,'fake_completions':0} and held['receipt_digest']
        assert client(second,recovery_only=True).lookup(job(8))['receipt_digest']==held['receipt_digest']
        assert client(first).submit(payloads[8],IMAGE)['receipt_digest']==held['receipt_digest']
        assert observe(8)==held
        controller.stop(refusal)
        save('DB_FAILURE',{'pre_admission_status':503,'receipt_write_refused':True,'known_state_retained':held})

        controller.stop(first);controller.stop(second)
        if restore is not None:backend=restore(backend)
        elif backend['mode']=='sqlite_fixture':
            destination=pathlib.Path(backend['filename']).with_name('restored.sqlite')
            with sqlite3.connect(backend['filename']) as source,sqlite3.connect(destination) as target:source.backup(target)
            backend={**backend,'filename':str(destination)}
        else:raise AssertionError('Explicit isolated PostgreSQL backup/restore callback required')
        controller.backend=backend
        fresh=controller.start()
        restored_before=observe(0)
        assert restored_before==stable
        assert client(fresh,recovery_only=True).lookup(job(0))['receipt_digest']==stable['receipt_digest']
        assert client(fresh).submit(payloads[0],IMAGE)['receipt_digest']==stable['receipt_digest']
        assert observe(0)==stable
        save('RESTART_RESTORE',{'consistent_snapshot_retained':True,'new_worker_pid':fresh.process.pid,**stable})

        warm=controller.start(expires_in=2)
        assert client(warm).lookup(job(0))['http_status']==200
        time.sleep(max(0,warm.expires_at-time.time())+.05) # Fixed <=2s deadline, no keepalive.
        expiry_before=observe(9)
        assert client(warm).submit(payloads[9],IMAGE)['http_status']==410
        assert client(warm).lookup(job(0))['http_status']==410
        assert client(warm,token='incorrect-offline-fixture-token-at-least32').lookup(job(0))['http_status']==401
        assert observe(9)==expiry_before
        controller.stop(warm)
        try:controller.start(expires_in=-1)
        except CrashControllerError:pass
        else:raise AssertionError('Expired cold worker started')
        assert any(e['event']=='worker_start_refused' and e['code']=='STAGING_CAMPAIGN_WINDOW_INVALID' for e in controller.events)
        save('EXPIRY',{'warm_authenticated':410,'warm_unauthorized':401,'cold_start':'REFUSED',
            'cold_platform_http_status':'NOT_VERIFIED','database_unchanged':True})

        legacy_before=observe(10)
        legacy=client(fresh).submit(payloads[10],IMAGE)
        legacy_after=observe(10)
        # Production SQL creates a retained legacy hold on its first inspection.
        assert legacy['outcome']=='RECONCILIATION_REQUIRED' and legacy_after['legacy_hold']
        assert legacy_after['counts']==legacy_before['counts']=={'spawn_attempts':0,'fake_model_starts':0,'fake_completions':0}
        assert client(fresh).submit(payloads[10],IMAGE)['outcome']=='RECONCILIATION_REQUIRED'
        assert observe(10)==legacy_after
        save('LEGACY_HOLD',legacy_after)

        assert client(fresh).submit(payloads[11],IMAGE)['outcome']=='PROCESSING'
        counter=probe_backend(backend,lambda phase:None)
        counter.event(job(11),'model_start','fc-staging-'+uuid.uuid4().hex)
        negative=observe(11)
        assert negative['counts']['fake_model_starts']==2 and not one_start_oracle(negative['counts'])
        save('NEGATIVE_ORACLE',{'counterexample_classification':'FAIL','duplicate_detected':True,**negative})
        worker_events=controller.events
    assert all(not w.process.is_alive() for w in controller.workers)
    assert set(cases)==set(CASE_IDS)
    evidence.update({'schema_version':1,'scope':'OFFLINE_LOCAL','decision':'LIVE_BLOCKED','source_commit':source_commit,
        'database_mode':backend['mode'],'run_id':run,'budget_limits':budget.limits,'budget_used':budget.used,
        'cases':cases,'additional_crash_boundaries':snapshots,'requests':records,'worker_events':worker_events,
        'all_owned_workers_stopped':True,'live_cases':{key:'NOT_RUN' for key in CASE_IDS},
        'limitations':['No live authority, account/no-overage verification or cloud deployment',
            'Local worker PIDs do not prove Modal cross-container recovery',
            'Synthetic inline execution does not prove provider atomicity, media or exactly-once',
            'PostgreSQL mode uses psql fixture adapter, not live PostgREST']})
    return evidence
