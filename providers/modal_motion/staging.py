"""CPU-only protocol-2 probe. No Modal SDK, GPU worker or model imports.

Synthetic receipts never represent real provider acceptance or media output.
Only operator-prepared isolated jobs are eligible. No job/approval writes/reset.
Use an ASGI server bound to loopback; infrastructure deployment is separate.
"""
import base64
import binascii
import hmac
import json
import os
import re
import urllib.request
import urllib.parse
import uuid
from types import SimpleNamespace

from providers.modal_motion.admission import PostgresReceiptStore
from providers.modal_motion.contracts import ACKNOWLEDGEMENT, MAX_IMAGE_BYTES, MotionContractError
from providers.modal_motion import protocol

CPU_ACK='I_AUTHORIZE_ISOLATED_CPU_FAKE_EXECUTION_ONLY'


class ProbeRPC:
    """Staging-only sentinel/event RPC, with the production client's transport."""
    def __init__(self,store,run_id):self.store,self.run_id=store,run_id

    def __call__(self,action,job_id=None,**values):
        request=urllib.request.Request(
            self.store.url.removesuffix('modal_motion_admission')+'protocol2_staging_probe',
            data=json.dumps({'p_run_id':self.run_id,'p_action':action,'p_job_id':job_id,
                'p_event':values or None}).encode(),method='POST',headers={
                'Content-Type':'application/json','apikey':self.store.key,
                'Authorization':'Bearer '+self.store.key})
        try:
            with self.store.opener.open(request,timeout=10) as response:
                raw=response.read(32769)
                if response.status!=200 or len(raw)>32768:raise ValueError()
                return json.loads(raw)
        except Exception:
            raise MotionContractError('STAGING_DATABASE_UNAVAILABLE') from None


class StagingProbe:
    def __init__(self,store_factory,rpc,run_id,worker_id,checkpoint=None):
        self.store_factory,self.rpc=store_factory,rpc
        self.run_id=str(uuid.UUID(run_id));self.worker_id=worker_id
        self.checkpoint=checkpoint or (lambda phase:None)

    def checked_store(self):
        ready=self.rpc('ready')
        if (not isinstance(ready,dict) or ready.get('run_id')!=self.run_id or
            type(ready.get('schema')) is not int or ready['schema']!=2 or ready.get('fake_only') is not True):
            raise MotionContractError('STAGING_DATABASE_NOT_READY')
        return self.store_factory()

    def allowed(self,job_id):
        self.checked_store()
        key=str(uuid.UUID(job_id))
        if self.rpc('allowed',key) is not True:raise MotionContractError('STAGING_JOB_NOT_PREPARED')
        return key

    def event(self,job_id,phase,call_id):
        # Each attempt appends a distinct row. No per-job UPSERT hides duplicates.
        if self.rpc('event',job_id,phase=phase,call_id=call_id,
            worker_id=self.worker_id,event_id=str(uuid.uuid4())) is not True:
            raise MotionContractError('STAGING_EVENT_NOT_DURABLE')

    def fake_spawn(self,payload,source,ack):
        call_id='fc-staging-'+uuid.uuid4().hex
        job_id=payload['generation_job_id']
        self.event(job_id,'spawn_attempt',call_id)
        self.checkpoint('after_acceptance')
        protocol.publish_execution_receipt(payload,self.checked_store,lambda:call_id)
        self.event(job_id,'model_start',call_id)
        self.checkpoint('after_model_start')
        self.event(job_id,'completed',call_id)
        return SimpleNamespace(object_id=call_id)

    def submit(self,payload,source,ack):
        if ack!=CPU_ACK:raise MotionContractError('STAGING_CPU_ACK_REQUIRED')
        self.allowed(payload['generation_job_id'])
        result=protocol.reserve_motion(payload,source,ACKNOWLEDGEMENT,
            self.checked_store,self.fake_spawn)
        return {**result,'synthetic':True,'protocol':2,'worker_id':self.worker_id,'run_id':self.run_id}

    def inspect(self,job_id):
        key=self.allowed(job_id)
        receipt=protocol.submission_receipt(self.checked_store(),key)
        summary=self.rpc('summary',key)
        if not isinstance(summary,dict):raise MotionContractError('STAGING_SUMMARY_INVALID')
        return {**receipt,**summary,'synthetic':True,'protocol':2,'run_id':self.run_id}


def from_env():
    """No network here; no fallback to production environment variables."""
    stage=os.environ.get('BEATVISION_STAGING_SUPABASE_URL','')
    expected=os.environ.get('BEATVISION_STAGING_EXPECTED_ORIGIN','')
    production=os.environ.get('BEATVISION_PRODUCTION_SUPABASE_URL','')
    token=os.environ.get('BEATVISION_STAGING_PROBE_TOKEN','')
    if (os.environ.get('BEATVISION_PROTOCOL2_STAGING')!='ISOLATED_CPU_ONLY' or
        not expected or not production or
        len(token)<32 or '\n' in token or '\r' in token):
        raise MotionContractError('STAGING_CONFIGURATION_INVALID')
    store=PostgresReceiptStore(stage,os.environ.get('BEATVISION_STAGING_SERVICE_ROLE_KEY',''))
    # Validate all origins first, then compare actual HTTPS origins rather than
    # raw strings: hostname case and explicit :443 cannot bypass the denial.
    PostgresReceiptStore(expected,'origin-validation-only')
    PostgresReceiptStore(production,'origin-validation-only')
    def origin(url):
        parsed=urllib.parse.urlsplit(url)
        return parsed.scheme,parsed.hostname,parsed.port or 443
    if origin(stage)!=origin(expected) or origin(stage)==origin(production):
        raise MotionContractError('STAGING_CONFIGURATION_INVALID')
    try:run_id=str(uuid.UUID(os.environ.get('BEATVISION_STAGING_RUN_ID','')))
    except ValueError:raise MotionContractError('STAGING_CONFIGURATION_INVALID') from None
    rpc=ProbeRPC(store,run_id)
    return StagingProbe(lambda:store,rpc,run_id,'local-'+uuid.uuid4().hex),token


def create_app(probe,token):
    import fastapi
    from fastapi.responses import JSONResponse
    if not isinstance(token,str) or len(token)<32:raise MotionContractError('STAGING_AUTH_REQUIRED')
    web=fastapi.FastAPI(docs_url=None,redoc_url=None,openapi_url=None)

    @web.middleware('http')
    async def authenticate(request,call_next):
        supplied=request.headers.get('authorization','').encode()
        if not hmac.compare_digest(supplied,('Bearer '+token).encode()):
            return JSONResponse({'error':'STAGING_UNAUTHORIZED'},status_code=401)
        return await call_next(request)

    def error(exc):
        if not isinstance(exc,MotionContractError):return JSONResponse({'error':'STAGING_REQUEST_INVALID'},status_code=400)
        code=str(exc)
        status=503 if 'UNAVAILABLE' in code or 'NOT_READY' in code or code.startswith('MODAL_LEDGER_') else 409 if 'CONFLICT' in code else 400
        return JSONResponse({'error':code},status_code=status)

    @web.post('/submit')
    async def submit(request:fastapi.Request):
        try:
            raw=bytearray()
            async for chunk in request.stream():
                raw.extend(chunk)
                if len(raw)>((MAX_IMAGE_BYTES+2)//3)*4+8192:raise ValueError()
            data=json.loads(raw)
            if not isinstance(data,dict) or set(data)!={'payload','image_base64','ack'}:raise ValueError()
            if not isinstance(data['payload'],dict) or not isinstance(data['image_base64'],str):raise ValueError()
            result=probe.submit(data['payload'],base64.b64decode(data['image_base64'],validate=True),data['ack'])
            return JSONResponse(result,status_code=202 if result['status']=='reconciliation_required' else 200)
        except (MotionContractError,ValueError,KeyError,TypeError,binascii.Error) as exc:return error(exc)

    @web.get('/verify/{job_id}')
    async def verify(job_id:str):
        try:return probe.inspect(job_id)
        except (MotionContractError,ValueError,KeyError,TypeError) as exc:return error(exc)

    return web


def application():
    """ASGI factory: uvicorn ...:application --factory --host127.0.0.1."""
    probe,token=from_env()
    return create_app(probe,token)
