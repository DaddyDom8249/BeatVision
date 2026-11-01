"""Fixed local-only HTTP worker target. Private fault pipe; no crash API route."""
import asyncio
import json
import os
import threading
import time
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

from httpx import AsyncClient,ASGITransport
from providers.modal_motion.contracts import MotionContractError
from providers.modal_motion.probe_client import MAX_REQUEST,payload_digest
from providers.modal_motion.staging import create_app
from providers.modal_motion.tests.http_probe_fixture import probe_backend


def serve(control,config):
    context=threading.local();fired=threading.Event();lock=threading.Lock()
    def checkpoint(phase):
        if (phase!=config['boundary'] or getattr(context,'job',None)!=config['job_id'] or
            getattr(context,'request_id',None)!=config['request_id']):return
        with lock:
            if fired.is_set():return
            fired.set()
            control.send_bytes(json.dumps({'event':'boundary','pid':os.getpid(),'run_id':config['run_id'],
                'nonce':config['nonce'],'job_id':context.job,'request_id':context.request_id,'phase':phase,
                'request_digest':context.digest}).encode())
        # Parent must kill this exact owned process before it can advance.
        threading.Event().wait(30);os._exit(44)
    probe=probe_backend(config['backend'],checkpoint)
    if config['refuse_write']:
        original=probe.store_factory
        class RefusingStore:
            def get(self,key):return original().get(key)
            def put(self,key,value,skip_if_exists=False):
                operation='begin' if key.startswith('execution:') else 'reserve' if skip_if_exists else 'receipt'
                if operation==config['refuse_write']:raise MotionContractError('MODAL_LEDGER_UNAVAILABLE')
                return original().put(key,value,skip_if_exists)
        probe.store_factory=lambda:RefusingStore()
    if config['unavailable']:
        def unavailable(*args,**kwargs):raise MotionContractError('STAGING_DATABASE_UNAVAILABLE')
        probe.rpc=unavailable
    expires_at=None
    try:
        if config['expires_in'] is None:app=create_app(probe,config['token'])
        else:
            # Exercise the real packaged warm/cold window with a stub SDK only.
            from providers.modal_motion.tests.test_staging_modal_package import load_package
            module,_=load_package();module.from_env=lambda:(probe,config['token'])
            expires_at=time.time()+config['expires_in']
            os.environ['MODAL_TASK_ID']='ta-localFixture'+str(os.getpid())
            os.environ['BEATVISION_STAGING_CAMPAIGN_EXPIRES_AT']=datetime.fromtimestamp(expires_at,timezone.utc).isoformat()
            app=module.protocol2_probe()
            probe.worker_id='local-'+str(os.getpid()) # Never claim a real Modal task.
    except Exception as exc:
        control.send_bytes(json.dumps({'event':'startup_failed','pid':os.getpid(),'run_id':config['run_id'],
            'nonce':config['nonce'],'code':('STAGING_CAMPAIGN_WINDOW_INVALID' if isinstance(exc,MotionContractError)
                and str(exc)=='STAGING_CAMPAIGN_WINDOW_INVALID' else 'FIXTURE_STARTUP_FAILED')}).encode())
        return
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def handle_request(self):
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<=size<=MAX_REQUEST:raise ValueError()
                raw=self.rfile.read(size)
                context.job=None;context.digest=None;context.request_id=self.headers.get('X-BeatVision-Probe-Request-ID')
                if self.command=='POST':
                    value=json.loads(raw);request_payload=value.get('payload',{})
                    context.job=request_payload.get('generation_job_id');context.digest=payload_digest(request_payload)
                async def dispatch():
                    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://owned-fixture') as client:
                        return await client.request(self.command,self.path,content=raw,
                            headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','content-length')})
                response=asyncio.run(dispatch())
                if self.command=='POST' and response.status_code in (200,202):
                    checkpoint('before_http_reply')
                    time.sleep(config['delay_reply'])
                self.send_response(response.status_code)
                self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(response.content)))
                self.end_headers();self.wfile.write(response.content)
            except (BrokenPipeError,ConnectionResetError):pass
            except Exception:
                try:self.send_error(500,'FIXTURE_REQUEST_FAILED')
                except (BrokenPipeError,ConnectionResetError):pass
        do_POST=handle_request
        do_GET=handle_request
    class Server(ThreadingHTTPServer):
        daemon_threads=True;request_queue_size=64
    server=Server(('127.0.0.1',0),Handler);server.timeout=.2
    control.send_bytes(json.dumps({'event':'ready','pid':os.getpid(),'run_id':config['run_id'],
        'nonce':config['nonce'],'origin':'http://127.0.0.1:'+str(server.server_port),'expires_at':expires_at}).encode())
    deadline=time.monotonic()+config['lifetime']
    try:
        while time.monotonic()<deadline:
            if control.poll():break # EOF/unexpected parent message; never resume a fault.
            server.handle_request()
    finally:server.server_close();control.close()
