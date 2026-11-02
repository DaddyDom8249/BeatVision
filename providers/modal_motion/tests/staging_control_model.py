"""OFFLINE MODEL ONLY: executable proposal, never a trusted issuer or SDK adapter.

All witnesses/control calls are explicit fixtures. This module produces no
LivePermit and has no network, Modal, subprocess, deployment or real kill code.
Passing its tests establishes model properties, never provider capabilities.
"""
import hashlib
import json
import math
import os
import pathlib
import re
import sqlite3
import threading
import uuid
from dataclasses import dataclass
from functools import wraps

from providers.modal_motion.probe_client import canonical_origin,PRODUCTION_ORIGIN
from providers.modal_motion.probe_crash_controller import BOUNDARIES


class Refused(ValueError):pass


def require(condition,code='MODEL_EVIDENCE_REJECTED'):
    if not condition:raise Refused(code)


def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
def cloned(value):return json.loads(json.dumps(value,allow_nan=False))
def number(value):return type(value) in (int,float) and math.isfinite(value)
def hex64(value):return isinstance(value,str) and re.fullmatch('[0-9a-f]{64}',value) is not None


def sanitized(function):
    @wraps(function)
    def checked(*args,**kwargs):
        try:return function(*args,**kwargs)
        except Refused:raise
        except Exception:raise Refused('MODEL_EVIDENCE_REJECTED') from None
    return checked


@dataclass(frozen=True)
class ModelDecision:
    manifest_digest:str
    evidence_digest:str
    expires_utc:float
    scope:str='OFFLINE_MODEL_ONLY'


class MockWitness:
    """Fake independent authority. Facts are service-owned, not caller claims.

    In production an adapter must verify authenticated provider/owner evidence,
    actual enforcement, revocation and trust roots. This fixture does none of it.
    """
    def __init__(self,domain,manifest_digest,facts,clock):
        self.domain=domain;self.manifest_digest=manifest_digest;self.facts=cloned(facts);self.clock=clock
        self.corrupt={};self.failure=None;self.calls=0

    def read(self,challenge):
        self.calls+=1
        if self.failure:raise self.failure
        now=self.clock()
        return {**{'issuer':'offline-fixture/'+self.domain,'challenge':challenge,'observed_utc':now,
            'key_id':'fixture-'+self.domain+'-key','expires_utc':now+5,
            'manifest_digest':self.manifest_digest,'facts':cloned(self.facts)},**self.corrupt}


class PolicyModel:
    """Mock trust-root policy. Read-only decisions cannot authorize HTTP/control."""
    DOMAINS=('approval','account','deployment','database','access')
    PERMISSIONS=['probe_http','observe_task','stop_exact_task','read_fixture_evidence']
    ACTIONS=['POST','GET','CONTROL','OBSERVE','deploy','teardown']

    @sanitized
    def __init__(self,manifest,sources,clock=lambda:1000.0):
        self._manifest=cloned(manifest);self.sources=dict(sources)
        self._clock_reader=clock;self._last_clock=None;self._clock_lock=threading.Lock()
        m=self._manifest
        require(set(m)=={'owner_id','account_id','workspace_id','environment','app_id','function_id',
            'deployment_id','origin','source_commit','image_digest','database_id','run_id','fixtures',
            'limits','expires_utc','observe_until_utc'})
        for key in ['owner_id','account_id','workspace_id','app_id','function_id','deployment_id','database_id']:
            require(isinstance(m[key],str) and re.fullmatch('[A-Za-z0-9][A-Za-z0-9_-]{0,127}',m[key]) is not None)
        require(m['environment']=='bragoraforge-protocol2-staging')
        require(m['origin']==canonical_origin(m['origin']))
        require(m['origin'].split('://')[1].split('.')[0]!=PRODUCTION_ORIGIN.split('://')[1].split('.')[0])
        require(re.fullmatch('[0-9a-f]{40}',m['source_commit']) is not None and hex64(m['image_digest']))
        require(str(uuid.UUID(m['run_id']))==m['run_id'])
        require(number(m['expires_utc']) and self.clock()<m['expires_utc']<=self.clock()+600)
        require(number(m['observe_until_utc']) and m['expires_utc']<m['observe_until_utc']<=m['expires_utc']+3600)
        require(set(m['limits'])=={'POST','GET','total','CONTROL'})
        require(all(type(v) is int and 0<=v<=128 for v in m['limits'].values()))
        require(m['limits']['POST']<=64 and m['limits']['GET']<=64)
        require(1<=m['limits']['CONTROL']<=7 and 1<=m['limits']['total']<=m['limits']['POST']+m['limits']['GET'])
        require(0<len(m['fixtures'])<=32)
        for job,values in m['fixtures'].items():
            require(str(uuid.UUID(job))==job and set(values)=={'request_digest','snapshot_digest','provenance_digest'})
            require(all(hex64(value) for value in values.values()))

    @property
    def manifest(self):return cloned(self._manifest)

    def clock(self):
        with self._clock_lock:
            now=self._clock_reader()
            require(number(now) and (self._last_clock is None or now>=self._last_clock),'MODEL_CLOCK_REWOUND')
            self._last_clock=now
            return now

    def scope(self):
        m=self._manifest
        return {'origin':m['origin'],'run_id':m['run_id'],'source_commit':m['source_commit'],
            'request_hashes':{job:value['request_digest'] for job,value in m['fixtures'].items()},
            'limits':{key:m['limits'][key] for key in ['POST','GET','total']},'expires_utc':m['expires_utc']}

    @sanitized
    def evaluate(self,scope,action,job,*,task_id=None):
        m=self._manifest;now=self.clock()
        require(scope==self.scope() and action in self.ACTIONS and job in m['fixtures'],'MODEL_SCOPE_REJECTED')
        require(number(now) and now<(m['observe_until_utc'] if action=='OBSERVE' else m['expires_utc']),
            'MODEL_AUTHORITY_EXPIRED')
        require(set(self.sources)==set(self.DOMAINS),'MODEL_TRUST_ROOT_MISSING')
        facts={};proofs=[];deadlines=[]
        for domain in self.DOMAINS:
            source=self.sources[domain]
            require(type(source) is MockWitness and source.domain==domain,'MODEL_TRUST_ROOT_MISSING')
            challenge={'nonce':uuid.uuid4().hex,'action':action,'job_id':job,'manifest_digest':digest(m)}
            try:
                witness=source.read(challenge)
                require(witness['issuer']=='offline-fixture/'+domain and witness['challenge']==challenge)
                require(witness['key_id']=='fixture-'+domain+'-key')
                require(witness['manifest_digest']==digest(m))
                require(number(witness['observed_utc']) and now-5<=witness['observed_utc']<=now)
                require(number(witness['expires_utc']) and now<witness['expires_utc']<=now+5)
                facts[domain]=cloned(witness['facts']);proofs.append(digest(witness));deadlines.append(witness['expires_utc'])
            except Refused:raise
            except Exception:raise Refused('MODEL_EVIDENCE_UNAVAILABLE') from None
        a=facts['approval'];require(a.get('owner_id')==m['owner_id'] and a.get('audience')=='protocol2-staging')
        require(a.get('revoked') is False and a.get('actions')==self.ACTIONS)
        a=facts['account'];require(all(a.get(k)==m[k] for k in ['account_id','workspace_id']))
        require(a.get('provider_enforced') is True and a.get('credit_only') is True)
        require(type(a.get('paid_overage_limit')) is int and a['paid_overage_limit']==0)
        require(a.get('reserved_manifest')==digest(m))
        a=facts['deployment']
        require(all(a.get(k)==m[k] for k in ['account_id','workspace_id','environment','app_id','function_id',
            'deployment_id','origin','source_commit','image_digest']))
        require(a.get('cpu_only') is True and a.get('production') is False)
        require(type(a.get('max_containers')) is int and 1<=a['max_containers']<=2)
        require(type(a.get('max_inputs')) is int and a['max_inputs']==1)
        a=facts['database'];require(all(a.get(k)==m[k] for k in ['owner_id','database_id','run_id']))
        require(a.get('production') is False)
        require(all(a.get(k) is True for k in ['isolated','rls','retained_history','restore_verified',
            'automations_off','old_paths_disabled','approved_media','immutable_snapshots','provenance_valid']))
        require(a.get('approved_fixtures')==m['fixtures'])
        a=facts['access'];require(all(a.get(k)==m[k] for k in ['owner_id','account_id','workspace_id','app_id',
            'function_id','deployment_id']))
        require(a.get('scope_enforced') is True and a.get('permissions')==self.PERMISSIONS)
        if task_id is not None:require(a.get('target_task_id')==task_id,'MODEL_TASK_PERMISSION_REJECTED')
        require(self.clock()<min(m['observe_until_utc'] if action=='OBSERVE' else m['expires_utc'],
            min(deadlines)),'MODEL_AUTHORITY_EXPIRED')
        return ModelDecision(digest(m),digest(proofs),min(deadlines+[m['observe_until_utc'] if action=='OBSERVE' else m['expires_utc']]))

    @sanitized
    def reserve_request(self,scope,action,job,request_id,ledger):
        self.evaluate(scope,action,job)
        require(action in ('POST','GET') and type(ledger) is OperationLedger,'MODEL_SCOPE_REJECTED')
        ledger.reserve_request(self.manifest,action,job,request_id)
        return self.evaluate(scope,action,job) # Recheck without refunding; still no LivePermit/dispatch.


class OperationLedger:
    """Disposable SQLite model: atomic one-shot claims retained across restarts.

    This is not the production admission ledger, a migration or a live budget.
    """
    def __init__(self,path):
        self.path=pathlib.Path(path);self.unavailable=False;self.refuse_completion=False
        self.path.touch(mode=0o600,exist_ok=True)
        with self.connect() as db:
            db.execute('create table if not exists controls(operation_id text primary key,run_id text,task_id text,nonce text,target_digest text unique,'
                'manifest_digest text,boundary_digest text,state text,payload text,verification text,unique(run_id,task_id),unique(run_id,nonce))')
            db.execute('create table if not exists runs(run_id text primary key,manifest_digest text)')
            db.execute('create table if not exists requests(request_id text primary key,run_id text,action text,job_id text)')

    def connect(self):
        if self.unavailable:raise Refused('MODEL_LEDGER_UNAVAILABLE')
        return sqlite3.connect(self.path,timeout=10)

    def _bind(self,db,manifest):
        run=manifest['run_id'];value=digest(manifest)
        db.execute('insert or ignore into runs values(?,?)',(run,value))
        require(db.execute('select manifest_digest from runs where run_id=?',(run,)).fetchone()[0]==value,
            'MODEL_RUN_SCOPE_CHANGED')

    @sanitized
    def reserve_request(self,manifest,action,job,request_id):
        try:
            require(str(uuid.UUID(request_id))==request_id)
            with self.connect() as db:
                db.execute('begin immediate');self._bind(db,manifest)
                require(db.execute('select 1 from requests where request_id=?',(request_id,)).fetchone() is None,
                    'MODEL_REQUEST_REPLAY')
                count=db.execute('select count(*) from requests where run_id=? and action=?',(manifest['run_id'],action)).fetchone()[0]
                total=db.execute('select count(*) from requests where run_id=?',(manifest['run_id'],)).fetchone()[0]
                require(count<manifest['limits'][action] and total<manifest['limits']['total'],'MODEL_REQUEST_BUDGET_EXHAUSTED')
                db.execute('insert into requests values(?,?,?,?)',(request_id,manifest['run_id'],action,job))
        except (sqlite3.Error,OSError):raise Refused('MODEL_LEDGER_UNAVAILABLE') from None

    def claim(self,manifest,record):
        try:
            with self.connect() as db:
                db.execute('begin immediate');self._bind(db,manifest)
                row=db.execute('select operation_id,manifest_digest,boundary_digest from controls where run_id=? and task_id=?',
                    (manifest['run_id'],record['before']['task_id'])).fetchone()
                if row:
                    require(row[1]==digest(manifest) and row[2]==digest(record['before']),'MODEL_CLAIM_CONFLICT')
                    return row[0],False
                target=digest({key:record['task'][key] for key in ['account_id','workspace_id','task_id','incarnation']})
                require(db.execute('select 1 from controls where target_digest=?',(target,)).fetchone() is None,
                    'MODEL_UNCERTAIN_PREDECESSOR')
                count=db.execute('select count(*) from controls where run_id=?',(manifest['run_id'],)).fetchone()[0]
                require(count<manifest['limits']['CONTROL'],'MODEL_CONTROL_BUDGET_EXHAUSTED')
                operation=str(uuid.uuid4())
                db.execute('insert into controls values(?,?,?,?,?,?,?,?,?,?)',(operation,manifest['run_id'],
                    record['before']['task_id'],record['before']['nonce'],target,digest(manifest),digest(record['before']),
                    'STOP_UNKNOWN',json.dumps(record),None))
                return operation,True
        except (sqlite3.Error,OSError):raise Refused('MODEL_LEDGER_UNAVAILABLE') from None

    def get(self,operation):
        with self.connect() as db:
            row=db.execute('select state,payload,manifest_digest,verification from controls where operation_id=?',(operation,)).fetchone()
        require(row is not None,'MODEL_OPERATION_UNKNOWN')
        return {'operation_id':operation,'state':row[0],'manifest_digest':row[2],
            'verification':json.loads(row[3]) if row[3] else None,**json.loads(row[1])}

    def count(self):
        with self.connect() as db:return db.execute('select count(*) from controls').fetchone()[0]

    def finish(self,operation,verification,validate=lambda:None):
        if self.refuse_completion:raise Refused('MODEL_LEDGER_UNAVAILABLE')
        try:
            with self.connect() as db:
                db.execute('begin immediate');validate()
                db.execute("update controls set state='MODEL_VERIFIED',verification=? where operation_id=? and state='STOP_UNKNOWN'",
                    (json.dumps(verification),operation))
                validate() # Roll back if proofs expire before the fixture commit.
        except (sqlite3.Error,OSError):raise Refused('MODEL_LEDGER_UNAVAILABLE') from None


class MockCheckpointStore:
    """Separate fake private database witness, never a provider response field."""
    def __init__(self,boundary,manifest_digest,clock):
        self.before=cloned(boundary);self.after=cloned(boundary);self.manifest_digest=manifest_digest
        self.clock=clock;self.quiescent=False;self.corrupt={};self.unavailable=False

    def read(self,challenge,after=False):
        if self.unavailable:raise Refused('MODEL_CHECKPOINT_UNAVAILABLE')
        return {'issuer':'offline-fixture/checkpoint','challenge':challenge,'manifest_digest':self.manifest_digest,
            'observed_utc':self.clock(),'expires_utc':self.clock()+5,'quiescent':self.quiescent,
            'facts':cloned(self.after if after else self.before),**self.corrupt}


class MockRemote:
    """Hypothetical mock capability, not a claim about Modal ContainerStop."""
    def __init__(self,manifest,boundary,clock):
        self.checkpoints=MockCheckpointStore(boundary,digest(manifest),clock);self.clock=clock
        self.task={**{key:manifest[key] for key in ['account_id','workspace_id','environment','app_id','function_id',
            'deployment_id','source_commit','image_digest']},'task_id':boundary['task_id'],
            'incarnation':boundary['incarnation'],'control_scope_task':boundary['task_id'],
            'only_input':boundary['request_id'],'generation_job_id':boundary['job_id'],'run_id':boundary['run_id'],
            'request_digest':boundary['request_digest'],'receipt_digest':boundary['receipt_digest'],
            'state':'running','stop_semantics':'abrupt_no_reschedule',
            'rescheduled':False,'replacement_tasks':[]}
        self.stop_calls=[];self.lose_reply=False;self.calls_path=None
        self.manifest_digest=digest(manifest);self.corrupt_identity={}

    @property
    def before(self):return self.checkpoints.before
    @property
    def after(self):return self.checkpoints.after

    def observe(self,challenge):
        return {'issuer':'offline-fixture/provider','challenge':challenge,'observed_utc':self.clock(),
            'expires_utc':self.clock()+5,'manifest_digest':self.manifest_digest,'facts':cloned(self.task),
            **self.corrupt_identity}

    def stop(self,operation,task):
        self.stop_calls.append((operation,task))
        if self.calls_path is not None:
            # Separate append-only fake provider evidence: every call is counted.
            descriptor=os.open(self.calls_path,os.O_CREAT|os.O_APPEND|os.O_WRONLY,0o600)
            try:os.write(descriptor,(json.dumps({'operation_id':operation,'task_id':task})+'\n').encode())
            finally:os.close(descriptor)
        if self.lose_reply:raise TimeoutError('synthetic lost stop response')
        return {} # Empty ACK is deliberately insufficient evidence.

    def finish(self):
        require(bool(self.stop_calls))
        self.task.update({'state':'terminated','termination':{'forced':True,'no_reschedule':True,
            'operation_id':self.stop_calls[-1][0],'boundary_digest':digest(self.before),'finished_utc':self.clock()}})
        self.checkpoints.quiescent=True


class RemoteFaultModel:
    """No arbitrary task argument: task comes from the private DB checkpoint."""
    def __init__(self,policy,ledger,remote):
        require(type(policy) is PolicyModel and type(ledger) is OperationLedger and type(remote) is MockRemote)
        require(type(remote.checkpoints) is MockCheckpointStore)
        self.policy=policy;self.ledger=ledger;self.remote=remote;self.checkpoints=remote.checkpoints

    def _still_valid(self,deadlines,action):
        m=self.policy.manifest;horizon=m['observe_until_utc'] if action=='OBSERVE' else m['expires_utc']
        require(self.policy.clock()<min([horizon]+deadlines),'MODEL_OBSERVATION_EXPIRED')

    def _checkpoint(self,job,phase,after=False,deadlines=None):
        deadlines=[] if deadlines is None else deadlines
        challenge={'nonce':uuid.uuid4().hex,'job_id':job,'phase':phase,'manifest_digest':digest(self.policy.manifest)}
        now=self.policy.clock();witness=self.checkpoints.read(challenge,after)
        require(witness['issuer']=='offline-fixture/checkpoint' and witness['challenge']==challenge)
        require(witness['manifest_digest']==digest(self.policy.manifest))
        require(number(witness['observed_utc']) and now-5<=witness['observed_utc']<=now)
        require(number(witness['expires_utc']) and now<witness['expires_utc']<=now+5)
        deadlines.append(witness['expires_utc']);self._still_valid(deadlines,'OBSERVE' if after else 'CONTROL')
        return witness

    @sanitized
    def _boundary(self,job,phase,deadlines=None):
        deadlines=[] if deadlines is None else deadlines
        m=self.policy.manifest;b=cloned(self._checkpoint(job,phase,deadlines=deadlines)['facts'])
        require(phase in BOUNDARIES and b.get('phase')==phase and b.get('job_id')==job)
        require(b.get('run_id')==m['run_id'] and b.get('owner_id')==m['owner_id'])
        require(b.get('paused') is True and type(b.get('revision')) is int and b['revision']>0)
        require(number(b.get('pause_expires_utc')) and self.policy.clock()<b['pause_expires_utc']<=m['expires_utc'])
        deadlines.append(b['pause_expires_utc'])
        require(hex64(b.get('nonce')) and hex64(b.get('incarnation')))
        require(str(uuid.UUID(b['request_id']))==b['request_id'])
        require(all(b.get(k)==v for k,v in m['fixtures'][job].items()))
        require(b.get('admission_present') is True)
        starts=0 if phase=='after_reserve' else 1
        models=int(phase in ('after_model_start','before_http_reply'));complete=int(phase=='before_http_reply')
        counts=b.get('counts',{})
        require(set(counts)=={'spawn_attempts','fake_model_starts','fake_completions'})
        require(all(type(v) is int for v in counts.values()))
        require(counts==dict(zip(['spawn_attempts','fake_model_starts','fake_completions'],[starts,models,complete])))
        fenced=phase not in ('after_reserve','after_acceptance')
        require(b.get('execution_fenced') is fenced)
        require(hex64(b.get('receipt_digest')) if fenced else b.get('receipt_digest') is None)
        require(b.get('receipt_persisted') is (phase in ('after_receipt','after_model_start','before_http_reply')))
        return b

    @sanitized
    def _identity(self,boundary,action='CONTROL',deadlines=None):
        deadlines=[] if deadlines is None else deadlines
        m=self.policy.manifest;now=self.policy.clock()
        challenge={'nonce':uuid.uuid4().hex,'action':action,'task_id':boundary['task_id'],
            'request_id':boundary['request_id'],'manifest_digest':digest(m)}
        witness=self.remote.observe(challenge)
        require(witness['issuer']=='offline-fixture/provider' and witness['challenge']==challenge)
        require(witness['manifest_digest']==digest(m))
        require(number(witness['observed_utc']) and now-5<=witness['observed_utc']<=now)
        require(number(witness['expires_utc']) and now<witness['expires_utc']<=now+5)
        deadlines.append(witness['expires_utc']);self._still_valid(deadlines,action)
        task=cloned(witness['facts'])
        require(all(task.get(k)==m[k] for k in ['account_id','workspace_id','environment','app_id','function_id',
            'deployment_id','source_commit','image_digest']))
        require(task.get('task_id')==boundary['task_id'] and re.fullmatch('ta-[A-Za-z0-9_-]+',task['task_id']) is not None)
        require(task.get('incarnation')==boundary['incarnation'] and task.get('control_scope_task')==boundary['task_id'])
        require(task.get('only_input')==boundary['request_id'])
        require(task.get('generation_job_id')==boundary['job_id'] and task.get('request_digest')==boundary['request_digest'])
        require(task.get('run_id')==boundary['run_id'])
        require(task.get('receipt_digest')==boundary['receipt_digest'])
        require(task.get('stop_semantics')=='abrupt_no_reschedule','MODEL_STOP_MECHANISM_UNSUPPORTED')
        return task

    @sanitized
    def stop_at_boundary(self,job,phase,*,crash=None,before_dispatch=lambda:None):
        deadlines=[self.policy.evaluate(self.policy.scope(),'CONTROL',job).expires_utc]
        before=self._boundary(job,phase,deadlines);task=self._identity(before,deadlines=deadlines)
        deadlines.append(self.policy.evaluate(self.policy.scope(),'CONTROL',job,task_id=before['task_id']).expires_utc)
        require(task['state']=='running')
        record={'before':before,'task':task,'issued_utc':self.policy.clock()}
        operation,created=self.ledger.claim(self.policy.manifest,record)
        if created:
            if crash=='after_claim':raise Refused('SIMULATED_CONTROLLER_CRASH')
            before_dispatch()
            deadlines.append(self.policy.evaluate(self.policy.scope(),'CONTROL',job,task_id=before['task_id']).expires_utc)
            require(self._boundary(job,phase,deadlines)==before and self._identity(before,deadlines=deadlines)==task,
                'MODEL_BOUNDARY_CHANGED')
            self._still_valid(deadlines,'CONTROL')
            try:self.remote.stop(operation,task['task_id'])
            except TimeoutError:pass # Keep durable unknown claim; never retry.
            if crash=='after_dispatch':raise Refused('SIMULATED_CONTROLLER_CRASH')
        return self._summary(operation)

    def _summary(self,operation):
        value=self.ledger.get(operation)
        return {key:value[key] for key in ['operation_id','state']}|{'scope':'OFFLINE_MODEL_ONLY'}

    @sanitized
    def reconcile(self,operation):
        row=self.ledger.get(operation);before=row['before']
        require(row['manifest_digest']==digest(self.policy.manifest),'MODEL_RUN_SCOPE_CHANGED')
        authorization=self.policy.evaluate(self.policy.scope(),'OBSERVE',before['job_id'],task_id=before['task_id'])
        deadlines=[authorization.expires_utc]
        task=self._identity(before,'OBSERVE',deadlines)
        if task.get('state')!='terminated':
            require(row['state']!='MODEL_VERIFIED','MODEL_OBSERVATION_CONFLICT')
            return self._summary(operation)
        require(task.get('rescheduled') is False and task.get('replacement_tasks')==[])
        proof=task.get('termination',{})
        require(proof.get('forced') is True and proof.get('no_reschedule') is True)
        require(proof.get('operation_id')==operation and proof.get('boundary_digest')==digest(before))
        require(number(proof.get('finished_utc')) and row['issued_utc']<=proof['finished_utc']<=self.policy.clock())
        after=self._checkpoint(before['job_id'],before['phase'],after=True,deadlines=deadlines)
        require(after['quiescent'] is True and after['facts']==before,'MODEL_DURABLE_STATE_CHANGED')
        self._still_valid(deadlines,'OBSERVE')
        verification={'termination':proof,'before_digest':digest(before),'after_digest':digest(after['facts']),
            'provider_identity_digest':digest(task),'checkpoint_proof_digest':digest(after),
            'authority_digest':authorization.evidence_digest,'observed_utc':self.policy.clock()}
        self.ledger.finish(operation,verification,lambda:self._still_valid(deadlines,'OBSERVE'))
        return self._summary(operation)
