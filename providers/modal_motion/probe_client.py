"""Bounded protocol-2 HTTP tooling. No SDK, deployment or automatic POST retry.

HTTPS requires an external trusted authorizer on every request. The shipped CLI
never supplies one. Authorization references are not proof of account eligibility.
Local permits are issued only by the owned-process fixture controller.
"""
import base64
import hashlib
import http.client
import json
import math
import multiprocessing
import re
import ssl
import threading
import time
import urllib.parse
import uuid
from dataclasses import dataclass

from providers.modal_motion.contracts import MotionRequest,validate_request
from providers.modal_motion.staging import CPU_ACK

MAX_RESPONSE=32768
MAX_REQUEST=12*1024*1024
_FIXTURE_SEAL=object()
PRODUCTION_ORIGIN='https://beatvision--bragoraforge-modal-motion-proof-motion-api.us-east.modal.run'


class ProbeClientError(ValueError):pass


def canonical_origin(value,local=False):
    try:
        parsed=urllib.parse.urlsplit(value)
        port=parsed.port
    except (ValueError,TypeError):raise ProbeClientError('STAGING_ORIGIN_INVALID') from None
    if (parsed.username is not None or parsed.password is not None or parsed.path not in ('','/') or
        parsed.query or parsed.fragment or '?' in value or '#' in value):raise ProbeClientError('STAGING_ORIGIN_INVALID')
    if local:
        if parsed.scheme!='http' or parsed.hostname!='127.0.0.1' or not port or not 1<=port<=65535:
            raise ProbeClientError('STAGING_ORIGIN_INVALID')
        return 'http://127.0.0.1:'+str(port)
    if (parsed.scheme!='https' or port not in (None,443) or
        not re.fullmatch(r'[a-z0-9-]+(?:\.[a-z0-9-]+)?\.modal\.run',parsed.hostname or '')):
        raise ProbeClientError('STAGING_ORIGIN_INVALID')
    return 'https://'+parsed.hostname


def payload_digest(payload):
    return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()


@dataclass(frozen=True,repr=False)
class Credentials:
    probe_token:str
    proxy_key:str=''
    proxy_secret:str=''

    def headers(self,local=False):
        values=[self.probe_token] if local else [self.probe_token,self.proxy_key,self.proxy_secret]
        if (not isinstance(self.probe_token,str) or len(self.probe_token)<32 or any(not isinstance(v,str) or not v or
            any(ord(c)<32 or ord(c)>126 for c in v) for v in values)):
            raise ProbeClientError('STAGING_CREDENTIALS_INVALID')
        headers={'Content-Type':'application/json','Authorization':'Bearer '+self.probe_token}
        if not local:headers.update({'Modal-Key':self.proxy_key,'Modal-Secret':self.proxy_secret})
        return headers


class RequestBudget:
    def __init__(self,post=20,get=8,total=28,seconds=120,timeout=5):
        if (any(type(v) is not int or v<0 for v in [post,get,total]) or total<1 or
            post>64 or get>64 or total>128 or total>post+get or
            any(type(v) not in (int,float) or not math.isfinite(v) for v in [seconds,timeout]) or
            not 0<timeout<=10 or not 0<seconds<=600):
            raise ProbeClientError('STAGING_BUDGET_INVALID')
        self.limits={'POST':post,'GET':get,'total':total}
        self.used={'POST':0,'GET':0,'total':0};self.timeout=timeout
        self.expires_utc=time.time()+seconds;self.deadline=time.monotonic()+seconds
        self.lock=threading.Lock()
        self.receipts={};self.jobs={}
        self.request_ids=set()
        self.aborted=False

    def debit(self,method,request_id):
        with self.lock:
            if self.aborted:raise ProbeClientError('STAGING_CAMPAIGN_ABORTED')
            remaining=self.deadline-time.monotonic()
            if remaining<=0:raise ProbeClientError('STAGING_CAMPAIGN_EXPIRED')
            if self.used[method]>=self.limits[method] or self.used['total']>=self.limits['total']:
                raise ProbeClientError('STAGING_REQUEST_CAP_REACHED')
            if request_id in self.request_ids:raise ProbeClientError('STAGING_REQUEST_ID_REPLAY')
            self.request_ids.add(request_id)
            self.used[method]+=1;self.used['total']+=1
            return min(self.timeout,remaining)


@dataclass(frozen=True)
class LivePermit:
    """Returned by a separately supplied trusted authorizer, never by CLI/env.

    Issuer must verify actual owner/account/DB/teardown evidence outside this
    library. Scope matching alone does not prove approval or no-overage.
    """
    scope_digest:str
    expires_utc:float
    authority_reference:str
    no_overage_reference:str
    database_reference:str
    teardown_reference:str


class _OwnedEndpoint:
    def __init__(self,process,origin,run_id,seal):
        if seal is not _FIXTURE_SEAL:raise ProbeClientError('FIXTURE_PERMIT_INVALID')
        self.process=process;self.pid=process.pid;self.origin=canonical_origin(origin,True)
        self.run_id=run_id;self.seal=seal


def _owned_endpoint(process,origin,run_id):
    # Private controller entry point, not a config/manifest/CLI permission flag.
    if not process.is_alive():raise ProbeClientError('FIXTURE_WORKER_NOT_ALIVE')
    return _OwnedEndpoint(process,origin,run_id,_FIXTURE_SEAL)


def _http_exchange(send,origin,path,method,headers,body,timeout,deadline):
    """Fixed transport child; http.client never follows redirects."""
    connection=None
    try:
        parsed=urllib.parse.urlsplit(origin)
        connection=(http.client.HTTPSConnection(parsed.hostname,parsed.port or 443,
            timeout=timeout,context=ssl.create_default_context()) if parsed.scheme=='https' else
            http.client.HTTPConnection(parsed.hostname,parsed.port,timeout=timeout))
        if time.monotonic()>=deadline:raise TimeoutError()
        connection.connect()
        # DNS/TLS can outlive a short permit. Never dispatch after it expires.
        remaining=deadline-time.monotonic()
        if remaining<=0:raise TimeoutError()
        if connection.sock:connection.sock.settimeout(min(timeout,remaining))
        connection.request(method,path,body=body,headers=headers)
        response=connection.getresponse();status=response.status
        raw=response.read(MAX_RESPONSE+1) if 200<=status<300 else b''
        result={'status':status,'body':base64.b64encode(raw).decode(),'error':None}
    except Exception:
        result={'status':None,'body':'','error':'STAGING_TRANSPORT_UNAVAILABLE'}
    finally:
        if connection:connection.close()
    try:send.send_bytes(json.dumps(result).encode())
    finally:send.close()


class ProcessTransport:
    """Total request deadline, including DNS/TLS/slow-drip headers/body.

    A killed POST transport may already have dispatched; caller must reconcile.
    No daemon thread remains capable of sending a late request after timeout.
    """
    def exchange(self,origin,path,method,headers,body,timeout,*,deadline):
        timeout=min(timeout,max(0,deadline-time.monotonic()))
        if timeout<=0:return {'status':None,'body':'','error':'STAGING_HTTP_TIMEOUT','transport_exit':None}
        context=multiprocessing.get_context('spawn');receive,send=context.Pipe(duplex=False)
        process=context.Process(target=_http_exchange,args=(send,origin,path,method,headers,body,timeout,deadline))
        started=time.monotonic();result=None
        try:
            process.start();send.close()
            if receive.poll(max(0,timeout-(time.monotonic()-started))):
                result=json.loads(receive.recv_bytes(65536))
        except (EOFError,OSError,ValueError):pass
        finally:
            send.close();receive.close()
            if process.pid is not None:
                try:
                    if result is not None:process.join(min(.25,max(0,timeout-(time.monotonic()-started))))
                    if process.is_alive():process.kill()
                    process.join(2)
                    if process.is_alive():raise RuntimeError()
                except Exception:raise ProbeClientError('STAGING_TRANSPORT_CLEANUP_FAILED') from None
        if result is None:result={'status':None,'body':'','error':'STAGING_HTTP_TIMEOUT'}
        result['transport_exit']=process.exitcode
        return result


class StagingHTTPClient:
    def __init__(self,origin,approved_origin,production_origin,run_id,source_commit,
        request_hashes,credentials,budget,*,authorizer=None,fixture=None,transport=None,
        records=None,recovery_only=False):
        self.local=fixture is not None
        self.origin=canonical_origin(origin,self.local)
        if self.origin!=canonical_origin(approved_origin,self.local):raise ProbeClientError('STAGING_ORIGIN_NOT_ALLOWLISTED')
        production_labels={urllib.parse.urlsplit(canonical_origin(value)).hostname.split('.')[0]
            for value in (production_origin,PRODUCTION_ORIGIN)}
        if not self.local and urllib.parse.urlsplit(self.origin).hostname.split('.')[0] in production_labels:
            raise ProbeClientError('STAGING_PRODUCTION_ORIGIN_DENIED')
        self.run_id=str(uuid.UUID(run_id))
        if not re.fullmatch(r'[0-9a-f]{40}',source_commit):raise ProbeClientError('STAGING_SOURCE_COMMIT_INVALID')
        self.source_commit=source_commit;self.request_hashes=dict(request_hashes)
        for job,digest in self.request_hashes.items():
            if str(uuid.UUID(job))!=job or not re.fullmatch(r'[0-9a-f]{64}',digest):raise ProbeClientError('STAGING_FIXTURE_INVALID')
        if not self.request_hashes:raise ProbeClientError('STAGING_FIXTURE_INVALID')
        self.credentials=credentials;self.headers=credentials.headers(self.local);self.budget=budget
        self.authorizer=authorizer;self.fixture=fixture;self.transport=transport or ProcessTransport()
        self.records=records if records is not None else [];self.record_lock=threading.Lock()
        self.recovery_only=recovery_only

    def scope(self):
        return {'origin':self.origin,'run_id':self.run_id,'source_commit':self.source_commit,
            'request_hashes':dict(self.request_hashes),'limits':dict(self.budget.limits),'expires_utc':self.budget.expires_utc}

    def _authorize(self,method,job):
        if self.local:
            f=self.fixture
            if (type(f) is not _OwnedEndpoint or f.seal is not _FIXTURE_SEAL or f.origin!=self.origin or
                f.run_id!=self.run_id or f.pid!=f.process.pid or not f.process.is_alive()):
                raise ProbeClientError('FIXTURE_PERMIT_INVALID')
            return self.budget.deadline
        if self.authorizer is None:raise ProbeClientError('LIVE_EXECUTION_NOT_AUTHORIZED')
        scope=self.scope();expected=payload_digest(scope)
        try:permit=self.authorizer(json.loads(json.dumps(scope)),method,job)
        except Exception:raise ProbeClientError('LIVE_EXECUTION_NOT_AUTHORIZED') from None
        if (type(permit) is not LivePermit or permit.scope_digest!=expected or
            type(permit.expires_utc) not in (int,float) or not math.isfinite(permit.expires_utc) or
            not time.time()<permit.expires_utc<=self.budget.expires_utc or
            not all(isinstance(v,str) and v.strip() for v in [permit.authority_reference,
                permit.no_overage_reference,permit.database_reference,permit.teardown_reference])):
            raise ProbeClientError('LIVE_EXECUTION_NOT_AUTHORIZED')
        return min(self.budget.deadline,time.monotonic()+max(0,permit.expires_utc-time.time()))

    def submit(self,payload,image,*,request_id=None):
        if self.recovery_only:raise ProbeClientError('STAGING_RECOVERY_IS_GET_ONLY')
        if not isinstance(payload,dict) or set(payload)!={'project_id','scene_id','source_image_id',
            'generation_job_id','image_sha256','prompt','seed','admission_protocol'}:
            raise ProbeClientError('STAGING_REQUEST_NOT_PREPARED')
        validate_request(MotionRequest(**payload),image)
        job=str(uuid.UUID(payload['generation_job_id']))
        if payload['generation_job_id']!=job or self.request_hashes.get(job)!=payload_digest(payload):
            raise ProbeClientError('STAGING_REQUEST_NOT_PREPARED')
        data=json.dumps({'payload':payload,'image_base64':base64.b64encode(image).decode(),'ack':CPU_ACK}).encode()
        if len(data)>MAX_REQUEST:raise ProbeClientError('STAGING_REQUEST_TOO_LARGE')
        return self._request('POST','/submit',job,data,request_id)

    def lookup(self,job):
        try:key=str(uuid.UUID(job))
        except (ValueError,TypeError,AttributeError):raise ProbeClientError('STAGING_JOB_INVALID') from None
        if key not in self.request_hashes:raise ProbeClientError('STAGING_REQUEST_NOT_PREPARED')
        return self._request('GET','/verify/'+key,key,None)

    def _request(self,method,path,job,body,request_id=None):
        try:request_id=str(uuid.UUID(request_id)) if request_id else str(uuid.uuid4())
        except (ValueError,TypeError,AttributeError):raise ProbeClientError('STAGING_REQUEST_ID_INVALID') from None
        deadline=self._authorize(method,job)
        timeout=min(self.budget.debit(method,request_id),max(0,deadline-time.monotonic()))
        started=time.monotonic()
        headers={**self.headers,'X-BeatVision-Probe-Request-ID':request_id,'Connection':'close'}
        fatal=False
        try:result=self.transport.exchange(self.origin,path,method,headers,body,timeout,deadline=deadline)
        except ProbeClientError as exc:
            fatal=str(exc)=='STAGING_TRANSPORT_CLEANUP_FAILED'
            result={'status':None,'body':'','error':'STAGING_TRANSPORT_UNAVAILABLE'}
        except Exception:result={'status':None,'body':'','error':'STAGING_TRANSPORT_UNAVAILABLE'}
        record={'request_id':request_id,'job_id':job,'method':method,'http_status':result.get('status'),
            'request_digest':self.request_hashes[job],
            'transport_exit':result.get('transport_exit'),'attempts':1,'outcome':'UNAVAILABLE',
            'acceptance_unknown':method=='POST','scope':'OFFLINE_LOCAL' if self.local else 'AUTHORIZED_STAGING',
            'duration_ms':round((time.monotonic()-started)*1000)}
        status=result.get('status')
        if type(status) is int and 300<=status<400:record['outcome']='REDIRECT_REFUSED'
        elif status in (200,202):
            try:
                raw=base64.b64decode(result['body'],validate=True)
                if len(raw)>MAX_RESPONSE:raise ValueError()
                value=json.loads(raw)
                if (not isinstance(value,dict) or type(value.get('protocol')) is not int or value['protocol']!=2 or
                    value.get('synthetic') is not True or value.get('run_id')!=self.run_id or
                    value.get('status') not in ('processing','reconciliation_required','not_found')):raise ValueError()
                receipt=value.get('job_id')
                if receipt is not None and not re.fullmatch(r'fc-staging-[0-9a-f]{32}',receipt):raise ValueError()
                if value['status']=='processing' and receipt is None:raise ValueError()
                worker=value.get('worker_id')
                if method=='POST' and (not isinstance(worker,str) or not re.fullmatch(
                    r'local-[A-Za-z0-9_-]{1,100}' if self.local else r'modal-ta-[A-Za-z0-9_-]{1,90}',worker)):raise ValueError()
                if method=='POST' and self.local and worker!='local-'+str(self.fixture.pid):raise ValueError()
                counts={}
                if method=='GET':
                    for key in ['spawn_attempts','fake_model_starts','fake_completions']:
                        number=value.get(key)
                        if type(number) is not int or not 0<=number<=1000000:raise ValueError()
                        counts[key]=number
                digest=hashlib.sha256(receipt.encode()).hexdigest() if receipt else None
                if digest:
                    with self.budget.lock:
                        if self.budget.receipts.get(digest,job)!=job or self.budget.jobs.get(job,digest)!=digest:
                            raise ValueError()
                        self.budget.receipts[digest]=job;self.budget.jobs[job]=digest
                record.update({'outcome':value['status'].upper(),'acceptance_unknown':method=='POST' and receipt is None,
                    'receipt_digest':digest,
                    'worker_id':worker if method=='POST' else None,'counts':counts})
            except Exception:record['outcome']='INVALID_RESPONSE'
        elif type(status) is int:record['outcome']='HTTP_REJECTED'
        if fatal:
            record['outcome']='FATAL_CLEANUP_FAILURE'
            with self.budget.lock:self.budget.aborted=True
        with self.record_lock:self.records.append(record)
        if fatal:raise ProbeClientError('STAGING_TRANSPORT_CLEANUP_FAILED')
        return record
