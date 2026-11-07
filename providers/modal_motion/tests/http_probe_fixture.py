"""Durable CPU test fixtures. SQLite is a simulation, not PostgreSQL/RLS proof.

Actual service-role RPCs are available only inside the existing isolated CI DB.
No production environment, arbitrary SQL command or cloud credential fallback.
"""
import hashlib
import json
import os
import pathlib
import sqlite3
import sys
import uuid

from providers.modal_motion.contracts import MotionContractError
from providers.modal_motion.probe_client import payload_digest
from providers.modal_motion.staging import StagingProbe

IMAGE=b'\x89PNG\r\n\x1a\n'+b'\x00'*32


def uid(number):return '00000000-0000-0000-0000-'+str(number).zfill(12)


def payload(number):
    return {'project_id':uid(100),'scene_id':uid(300),'source_image_id':uid(800),
        'generation_job_id':uid(number),'image_sha256':hashlib.sha256(IMAGE).hexdigest(),
        'prompt':'A character walks naturally across the approved fixture scene.',
        'seed':42,'admission_protocol':2}


def create_sqlite(directory,run_id,payloads,legacy=()):
    path=pathlib.Path(directory)/'http-probe.sqlite';path.touch(mode=0o600,exist_ok=False)
    with sqlite3.connect(path) as db:
        db.executescript('create table meta(run_id text primary key);'
            'create table prepared(job_id text primary key,payload text not null);'
            'create table receipts(key text primary key,value text not null);'
            'create table bindings(call_id text primary key,job_id text not null);'
            'create table events(event_id text primary key,job_id text,phase text,call_id text,worker_id text);')
        db.execute('insert into meta values(?)',(run_id,))
        for value in payloads:
            job=value['generation_job_id'];db.execute('insert into prepared values(?,?)',(job,json.dumps(value)))
            if job in legacy:db.execute('insert into receipts values(?,?)',(job,json.dumps({'state':'receipt_unknown','legacy_hold':True})))
    return {'mode':'sqlite_fixture','filename':str(path),'run_id':run_id,
        'request_hashes':{p['generation_job_id']:payload_digest(p) for p in payloads}}


class SQLiteFixture:
    def __init__(self,configuration):self.config=configuration
    def connect(self):return sqlite3.connect(self.config['filename'],timeout=10)
    def get(self,key):
        with self.connect() as db:row=db.execute('select value from receipts where key=?',(key,)).fetchone()
        return json.loads(row[0]) if row else None
    def put(self,key,value,skip_if_exists=False):
        execution=key.startswith('execution:');job=key.removeprefix('execution:')
        with self.connect() as db:
            db.execute('begin immediate')
            expected=db.execute('select payload from prepared where job_id=?',(job,)).fetchone()
            if not expected:raise MotionContractError('MODAL_ADMISSION_JOB_UNAVAILABLE')
            parent=db.execute('select value from receipts where key=?',(job,)).fetchone()
            parent=json.loads(parent[0]) if parent else None
            if skip_if_exists and not execution:
                if value.get('request')!=json.loads(expected[0]):raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
                if parent:
                    if not parent.get('legacy_hold') and parent['fingerprint']!=value['fingerprint']:
                        raise MotionContractError('MODAL_REQUEST_FINGERPRINT_CONFLICT')
                    return False
                db.execute('insert into receipts values(?,?)',(key,json.dumps(value)));return True
            if (not parent or parent.get('legacy_hold') or parent.get('fingerprint')!=value.get('fingerprint') or
                parent.get('admission_token')!=value.get('admission_token')):
                raise MotionContractError('MODAL_ADMISSION_IDENTITY_INVALID')
            existing=db.execute('select value from receipts where key=?',('execution:'+job,)).fetchone()
            existing=json.loads(existing[0]) if existing else None
            call=value.get('job_id')
            if parent.get('job_id') not in (None,call) or existing and existing['job_id']!=call:
                raise MotionContractError('MODAL_EXECUTION_RECEIPT_CONFLICT')
            bound=db.execute('select job_id from bindings where call_id=?',(call,)).fetchone()
            if bound and bound[0]!=job:raise MotionContractError('MODAL_EXECUTION_RECEIPT_REPLAY')
            db.execute('insert or ignore into bindings values(?,?)',(call,job))
            if execution:
                if not skip_if_exists:raise MotionContractError('MODAL_LEDGER_OPERATION_INVALID')
                if existing:return False
                db.execute('insert into receipts values(?,?)',(key,json.dumps(value)));return True
            # Retain prepared request/token and independent execution fence.
            parent.update({'state':'accepted','job_id':call})
            db.execute('update receipts set value=? where key=?',(json.dumps(parent),job));return True
    def rpc(self,action,job_id=None,**values):
        with self.connect() as db:
            run=db.execute('select run_id from meta').fetchone()
            if not run or run[0]!=self.config['run_id']:raise MotionContractError('STAGING_DATABASE_NOT_READY')
            if action=='ready':return {'run_id':run[0],'schema':2,'fake_only':True}
            allowed=db.execute('select 1 from prepared where job_id=?',(job_id,)).fetchone()
            if action=='allowed':return allowed is not None
            if not allowed:raise MotionContractError('STAGING_JOB_NOT_PREPARED')
            if action=='event':
                if values['phase'] not in ('spawn_attempt','model_start','completed'):raise ValueError('Invalid phase')
                db.execute('insert into events values(?,?,?,?,?)',(values['event_id'],job_id,values['phase'],values['call_id'],values['worker_id']))
                return True
            if action=='summary':
                return {label:db.execute('select count(*) from events where job_id=? and phase=?',(job_id,phase)).fetchone()[0]
                    for label,phase in [('spawn_attempts','spawn_attempt'),('fake_model_starts','model_start'),('fake_completions','completed')]}
            raise MotionContractError('STAGING_OPERATION_INVALID')
    def snapshot(self,job):
        parent=self.get(job);execution=self.get('execution:'+job)
        with self.connect() as db:
            expected=db.execute('select payload from prepared where job_id=?',(job,)).fetchone()
        receipt=(parent or {}).get('job_id') or (execution or {}).get('job_id')
        return {'ledger_present':parent is not None,'legacy_hold':bool((parent or {}).get('legacy_hold')),
            'receipt_digest':hashlib.sha256(receipt.encode()).hexdigest() if receipt else None,
            'execution_fenced':execution is not None,'ledger_digest':payload_digest({'parent':parent,'execution':execution}),
            'input_digest':payload_digest(json.loads(expected[0])) if expected else None,
            'counts':self.rpc('summary',job) if expected else {'spawn_attempts':0,'fake_model_starts':0,'fake_completions':0}}


def ci_sql():
    if (os.environ.get('CI')!='true' or os.environ.get('BEATVISION_PROTOCOL2_TEST_ISOLATED')!='1' or
        os.environ.get('PGHOST') not in ('localhost','127.0.0.1') or
        os.environ.get('PGDATABASE') not in ('enqueue_fixture','http_controller_restored') or os.environ.get('PGPORT')!='5432'):
        raise MotionContractError('ISOLATED_CI_DATABASE_REQUIRED')
    sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[3]/'scripts/test'))
    from verify_modal_admission import sql
    return sql


def probe_backend(config,checkpoint):
    if config['mode']=='sqlite_fixture':
        store=SQLiteFixture(config);instance=StagingProbe(lambda:store,store.rpc,config['run_id'],'local-'+str(os.getpid()))
    else:
        ci_sql()
        from verify_protocol2_staging import probe
        instance=probe(['psql'],config['run_id'])
    original=instance.store_factory
    class HookStore:
        def get(self,key):return original().get(key)
        def put(self,key,value,skip_if_exists=False):
            operation='begin' if key.startswith('execution:') else 'reserve' if skip_if_exists else 'receipt'
            if operation=='receipt':checkpoint('before_receipt')
            changed=original().put(key,value,skip_if_exists)
            if changed:checkpoint('after_'+operation)
            return changed
    instance.store_factory=lambda:HookStore()
    instance.checkpoint=checkpoint
    return instance


def snapshot(config,job):
    if config['mode']=='sqlite_fixture':return SQLiteFixture(config).snapshot(job)
    sql=ci_sql()
    value=sql(['psql'],"""select jsonb_build_object(
      'ledger_present',a.generation_job_id is not null,'legacy_hold',coalesce(a.legacy_hold,false),
      'receipt',coalesce(a.reservation->>'job_id',a.execution->>'job_id'),
      'execution_fenced',a.execution is not null,
      'ledger_digest',encode(sha256(convert_to(jsonb_build_object('parent',a.reservation,'execution',a.execution)::text,'UTF8')),'hex'),
      'input_digest',encode(sha256(convert_to(j.input_snapshot::text,'UTF8')),'hex'),'status',j.status,
      'counts',jsonb_build_object(
        'spawn_attempts',(select count(*) from private.protocol2_staging_events where job_id=:'job'::uuid and phase='spawn_attempt'),
        'fake_model_starts',(select count(*) from private.protocol2_staging_events where job_id=:'job'::uuid and phase='model_start'),
        'fake_completions',(select count(*) from private.protocol2_staging_events where job_id=:'job'::uuid and phase='completed')))
      from generation_jobs j left join private.modal_motion_admissions a on a.generation_job_id=j.id where j.id=:'job'::uuid;""",{'job':job})
    result=json.loads(value);assert result.pop('status')=='processing'
    receipt=result.pop('receipt');result['receipt_digest']=hashlib.sha256(receipt.encode()).hexdigest() if receipt else None
    return result
