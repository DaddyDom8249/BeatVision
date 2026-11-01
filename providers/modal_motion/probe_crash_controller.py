"""External crash control for owned, local CPU test workers only.

No arbitrary PID, command, Modal/container operation or HTTP crash endpoint.
The child pauses after the selected committed boundary on a private channel.
"""
import json
import multiprocessing
import secrets
import signal
import time
import uuid
from dataclasses import dataclass,field

from providers.modal_motion.probe_client import _owned_endpoint,canonical_origin

BOUNDARIES=frozenset(['after_reserve','after_acceptance','after_begin',
    'before_receipt','after_receipt','after_model_start','before_http_reply'])


class CrashControllerError(ValueError):pass


def _worker_entry(connection,configuration):
    from providers.modal_motion.tests.http_probe_worker import serve
    serve(connection,configuration)


@dataclass(repr=False)
class _Worker:
    process:object
    connection:object
    permit:object
    nonce:str=field(repr=False)
    job_id:str|None=None
    boundary:str|None=None
    request_id:str|None=None
    consumed:bool=False
    closed:bool=False
    expires_at:float|None=None


class CrashController:
    def __init__(self,backend,run_id,token,*,lifetime=120):
        if type(lifetime) is not int or not 1<=lifetime<=180:raise CrashControllerError('FIXTURE_LIFETIME_INVALID')
        if backend.get('mode') not in ('sqlite_fixture','postgres_ci_fixture'):
            raise CrashControllerError('FIXTURE_BACKEND_INVALID')
        self.backend=backend;self.run_id=str(uuid.UUID(run_id));self.token=token
        self.deadline=time.monotonic()+lifetime;self.workers=[];self.events=[]
        self.context=multiprocessing.get_context('spawn')

    def _remaining(self,ceiling):
        remaining=min(ceiling,self.deadline-time.monotonic())
        if remaining<=0:raise CrashControllerError('FIXTURE_CONTROLLER_EXPIRED')
        return remaining

    def start(self,*,job_id=None,boundary=None,unavailable=False,expires_in=None,refuse_write=None,delay_reply=0):
        if type(delay_reply) not in (int,float) or not 0<=delay_reply<=2:raise CrashControllerError('FIXTURE_FAULT_INVALID')
        if refuse_write not in (None,'reserve','begin','receipt'):raise CrashControllerError('FIXTURE_FAULT_INVALID')
        if boundary is not None and boundary not in BOUNDARIES:raise CrashControllerError('FIXTURE_BOUNDARY_INVALID')
        if boundary and not job_id:raise CrashControllerError('FIXTURE_JOB_REQUIRED')
        if job_id is not None:job_id=str(uuid.UUID(job_id))
        if job_id and job_id not in self.backend['request_hashes']:raise CrashControllerError('FIXTURE_JOB_NOT_PREPARED')
        nonce=secrets.token_hex(32);request_id=str(uuid.uuid4()) if boundary else None
        parent,child=self.context.Pipe(duplex=True)
        config={'backend':self.backend,'run_id':self.run_id,'token':self.token,'nonce':nonce,
            'job_id':job_id,'boundary':boundary,'request_id':request_id,'unavailable':unavailable,
            'lifetime':self._remaining(180),'expires_in':expires_in,'refuse_write':refuse_write,'delay_reply':delay_reply}
        process=self.context.Process(target=_worker_entry,args=(child,config),daemon=True)
        process.start();child.close()
        worker=_Worker(process,parent,None,nonce,job_id,boundary,request_id)
        self.workers.append(worker)
        try:
            if not parent.poll(self._remaining(15)):raise CrashControllerError('FIXTURE_START_TIMEOUT')
            frame=json.loads(parent.recv_bytes(4096))
            if (frame.get('event')=='startup_failed' and frame.get('pid')==process.pid and
                frame.get('run_id')==self.run_id and frame.get('nonce')==nonce):
                self.events.append({'event':'worker_start_refused','pid':process.pid,
                    'code':frame.get('code'),'scope':'OFFLINE_LOCAL'})
            if (set(frame)!={'event','pid','run_id','nonce','origin','expires_at'} or frame['event']!='ready' or
                frame['pid']!=process.pid or frame['run_id']!=self.run_id or frame['nonce']!=nonce):
                raise CrashControllerError('FIXTURE_HANDSHAKE_INVALID')
            origin=canonical_origin(frame['origin'],True)
            worker.permit=_owned_endpoint(process,origin,self.run_id)
            worker.expires_at=frame['expires_at']
            self.events.append({'event':'worker_started','pid':process.pid,'run_id':self.run_id,
                'scope':'OFFLINE_LOCAL','origin':origin})
            return worker
        except Exception:
            self.stop(worker)
            raise CrashControllerError('FIXTURE_START_FAILED') from None

    def _owned(self,worker):
        if not any(value is worker for value in self.workers):raise CrashControllerError('FIXTURE_NOT_OWNED')

    def crash_at_boundary(self,worker):
        self._owned(worker)
        if worker.consumed or worker.boundary not in BOUNDARIES or not worker.process.is_alive():
            raise CrashControllerError('FIXTURE_BOUNDARY_NOT_ARMED')
        try:
            if not worker.connection.poll(self._remaining(15)):raise CrashControllerError('FIXTURE_BOUNDARY_TIMEOUT')
            frame=json.loads(worker.connection.recv_bytes(4096))
            expected={'event':'boundary','pid':worker.process.pid,'run_id':self.run_id,'nonce':worker.nonce,
                'job_id':worker.job_id,'request_id':worker.request_id,'phase':worker.boundary,
                'request_digest':self.backend['request_hashes'][worker.job_id]}
            if frame!=expected:raise CrashControllerError('FIXTURE_BOUNDARY_MISMATCH')
        except (EOFError,OSError,ValueError):raise CrashControllerError('FIXTURE_BOUNDARY_INVALID') from None
        worker.consumed=True
        worker.process.kill();worker.process.join(2)
        if worker.process.is_alive():raise CrashControllerError('FIXTURE_KILL_TIMEOUT')
        if worker.process.exitcode!=-signal.SIGKILL:raise CrashControllerError('FIXTURE_EXTERNAL_KILL_NOT_CONFIRMED')
        event={key:value for key,value in expected.items() if key!='nonce'}
        event.update({'event':'worker_killed','exit_code':worker.process.exitcode,'scope':'OFFLINE_LOCAL'})
        self.events.append(event)
        return event

    def stop(self,worker):
        self._owned(worker)
        if worker.closed:return
        if worker.process.is_alive():worker.process.terminate();worker.process.join(2)
        if worker.process.is_alive():worker.process.kill();worker.process.join(2)
        if worker.process.is_alive():raise CrashControllerError('FIXTURE_CLEANUP_TIMEOUT')
        worker.connection.close()
        worker.closed=True
        self.events.append({'event':'worker_stopped','pid':worker.process.pid,
            'exit_code':worker.process.exitcode,'scope':'OFFLINE_LOCAL'})

    def close(self):
        failure=None
        for worker in self.workers:
            try:self.stop(worker)
            except Exception as exc:
                if failure is None:failure=exc
        if failure is not None:raise failure

    def __enter__(self):return self
    def __exit__(self,*args):self.close()
