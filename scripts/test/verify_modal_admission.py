"""Real worker + independent PostgreSQL sessions, CPU-only isolated fixtures.

No Modal SDK, torch, model download or provider request is made. PostgreSQL RPCs
are exercised through the production client's JSON boundary with a psql opener.
Run only after generation-enqueue-fixture.sql and durable admission migration.
"""
import argparse
import asyncio
import hashlib
import io
import json
import multiprocessing
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]))
from httpx import AsyncClient, ASGITransport
from providers.modal_motion.admission import PostgresReceiptStore
from providers.modal_motion.contracts import MotionContractError, MotionRequest, manifest
from providers.modal_motion.tests.test_submit_concurrency import IMAGE, body, worker_runtime

def uid(n):return '00000000-0000-0000-0000-'+str(n).zfill(12)
def sql(prefix,statement,variables=None,expected=0):
    command=prefix+['-X','-qAt','-v','ON_ERROR_STOP=1']
    for key,value in (variables or {}).items():command+=['-v',key+'='+value]
    result=subprocess.run(command,input=statement,text=True,capture_output=True,timeout=30)
    if result.returncode!=expected:
        print('Isolated PostgreSQL fixture request failed: '+result.stderr,file=sys.stderr,flush=True)
        raise RuntimeError('Isolated PostgreSQL fixture request failed')
    return result.stdout.strip()

class Reply(io.BytesIO):status=200
class PsqlOpener:
    def __init__(self,prefix,crash=None):self.prefix,self.crash=prefix,crash
    def open(self,request,timeout=10):
        data=json.loads(request.data);op=data['p_operation']
        if self.crash=='before_receipt' and op=='receipt':os._exit(42)
        value=sql(self.prefix,"select public.modal_motion_admission(:'job'::uuid,:'op',:'record'::jsonb,:'execution'::boolean);",{
          'job':data['p_job_id'],'op':op,'record':json.dumps(data['p_record']),
          'execution':'true' if data['p_execution'] else 'false'})
        if ((self.crash=='after_reservation' and op=='reserve') or
            (self.crash=='after_receipt' and op=='receipt') or
            (self.crash=='after_execution' and op=='begin')):os._exit(42)
        return Reply((value or 'null').encode())

def payload(number):
    return body(project_id=uid(100),scene_id=uid(300),source_image_id=uid(800),generation_job_id=uid(number))['payload']

def client(prefix,crash=None):
    return PostgresReceiptStore('https://fixture.supabase.co','fixture-only',PsqlOpener(prefix,crash))

def child(prefix,directory,number,entry,crash=None):
    data=payload(number);call_id='fc-pg-'+uuid.UUID(data['generation_job_id']).hex
    video=b'\x00\x00\x00\x18ftypisom'+b'moovmdat'+b'0'*2048
    def spawn(*args):
        sql(prefix,"insert into modal_admission_test_events(job_id) values(:'job'::uuid);",{'job':data['generation_job_id']})
        if crash=='after_acceptance':os._exit(42)
        return SimpleNamespace(object_id=call_id)
    result={'video':video,'manifest':manifest(MotionRequest(**data),video,
      model='Lightricks/LTX-Video-0.9.5',revision='e58e28c39631af4d1468ee57a853764e11c1d37e')}
    worker=worker_runtime(client(prefix,crash),spawn,lambda _:result,execution_call_id=call_id)
    worker.modal.Dict.from_name=lambda *a,**kw: (_ for _ in ()).throw(AssertionError('Dict authority forbidden'))
    if entry=='begin':
        record=client(prefix).get(data['generation_job_id'])
        try:worker._publish_execution_receipt({**data,'admission_token':record['admission_token']})
        except MotionContractError as exc:
            if str(exc)=='MODAL_EXECUTION_ALREADY_ADMITTED':os._exit(43)
            raise
    elif entry=='cli':
        os.environ['BRAGORA_MODAL_GPU_ENABLED']='true'
        args={key:value for key,value in data.items() if key not in ('image_sha256','admission_protocol')}
        try:
            worker.main(image_path=str(pathlib.Path(directory)/'source.png'),output_dir=str(pathlib.Path(directory)/str(os.getpid())),
              execute=True,acknowledgment=body()['ack'],**args)
        except MotionContractError as exc:
            if str(exc)!='MODAL_SUBMISSION_RECONCILIATION_REQUIRED':raise
    else:
        async def request():
            async with AsyncClient(transport=ASGITransport(app=worker.motion_api()),base_url='http://fixture') as http:
                response=await http.post('/submit',json={'payload':data,'image_base64':body()['image_base64'],'ack':body()['ack']})
                if response.status_code not in (200,202):raise AssertionError(response.text)
        asyncio.run(request())

def seed(prefix,number):
    data=payload(number)
    sql(prefix,"""insert into generation_jobs(id,project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,status,input_snapshot,output)
      values(:'job'::uuid,:'project'::uuid,:'lock'::uuid,:'plan'::uuid,:'scene'::uuid,'scene_motion','processing',:'input'::jsonb,:'output'::jsonb);""",{
      'job':uid(number),'project':uid(100),'lock':uid(400),'plan':uid(200),'scene':uid(300),
      'input':json.dumps({'modal_motion':{'admission_protocol':2,'source_image_id':uid(800),
        'model':'Lightricks/LTX-Video-0.9.5','revision':'e58e28c39631af4d1468ee57a853764e11c1d37e'}}),
      'output':json.dumps({'modal_dispatch_payload':data,'modal_source_sha256':data['image_sha256'],'dispatch_intent':{'request_id':'beatvision:'+uid(number)}})})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--psql',default='["psql"]');parser.add_argument('--verify-existing',action='store_true')
    parser.add_argument('--expect-unavailable',action='store_true')
    args=parser.parse_args()
    if os.environ.get('BEATVISION_LEDGER_TEST_ISOLATED')!='1':raise SystemExit('Explicit isolated fixture acknowledgement required')
    prefix=json.loads(args.psql);context=multiprocessing.get_context('spawn')
    if args.expect_unavailable:
        spawn=MagicMock();worker=worker_runtime(client(prefix),spawn)
        try:worker._reserve_motion(payload(10001),IMAGE,body()['ack'])
        except MotionContractError as exc:assert str(exc)=='MODAL_LEDGER_UNAVAILABLE'
        else:raise AssertionError('Unavailable database unexpectedly granted admission')
        spawn.assert_not_called();print('PASS: actual database outage fails closed with zero provider submissions');return
    for role in ['anon','authenticated']:
        sql(prefix,'set role '+role+';select public.modal_motion_admission(\''+uid(10001)+"','lookup',null,false);",expected=3)
    for role in ['anon','authenticated','service_role']:
        sql(prefix,'set role '+role+';delete from private.modal_motion_admissions;',expected=3)
    def finish(process,code=0):
        process.join(45)
        if process.is_alive():process.kill();process.join();raise AssertionError('Fixture process timeout')
        assert process.exitcode==code,(process.exitcode,code)
    def count(number):return int(sql(prefix,"select count(*) from modal_admission_test_events where job_id=:'job'::uuid;",{'job':uid(number)}))
    with tempfile.TemporaryDirectory() as directory:
        pathlib.Path(directory,'source.png').write_bytes(IMAGE)
        def process(number,entry,crash=None):
            p=context.Process(target=child,args=(prefix,directory,number,entry,crash));p.start();return p
        if args.verify_existing:
            for number in range(10001,10006):
                assert client(prefix).get(uid(number)) is not None
                before=count(number);finish(process(number,'http'));assert count(number)==before
            print('PASS: independent PostgreSQL restart retained every claim; retries created zero new provider submissions')
            return
        sql(prefix,'create table modal_admission_test_events(job_id uuid not null);')
        for number in range(10001,10006):seed(prefix,number)
        contenders=[process(10001,'cli' if n%2 else 'http') for n in range(20)]
        for p in contenders:finish(p)
        assert count(10001)==1
        # Simulate any amount of cache inactivity/expiry. No Dict is consulted,
        # and the authoritative PostgreSQL row is retained for a century.
        sql(prefix,"update private.modal_motion_admissions set created_at=now()-interval '100 years';")
        finish(process(10001,'cli'));assert count(10001)==1
        for number,crash,expected in [(10002,'after_reservation',0),(10003,'after_acceptance',1),
          (10004,'before_receipt',1),(10005,'after_receipt',1)]:
            finish(process(number,'cli',crash),42)
            for entry in ['http','cli']:finish(process(number,entry))
            assert count(number)==expected,(number,count(number),expected)
        # A separate accepted worker supplies its identity after caller death.
        finish(process(10003,'begin','after_execution'),42)
        assert client(prefix).get('execution:'+uid(10003))['job_id'].startswith('fc-pg-')
        finish(process(10003,'http'));assert count(10003)==1
        duplicate=process(10003,'begin');finish(duplicate,43) # Reentry is refused.
        print('PASS:20 independent CLI/HTTP contenders=1 submission;100-year retained claim;4 process-death boundaries;lost execution-claim reply;same-call reentry blocked')

if __name__=='__main__':main()
