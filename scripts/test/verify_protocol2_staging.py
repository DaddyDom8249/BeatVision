"""Isolated PostgreSQL + independent CPU ASGI workers; never Modal/GPU.

Requires explicit --psql JSON argv and BEATVISION_PROTOCOL2_TEST_ISOLATED=1.
The opener uses real production JSON/auth headers, translated into fixture SQL.
This is not live PostgREST/Modal transport or cross-container verification.
"""
import argparse
import asyncio
import io
import json
import multiprocessing
import os
import pathlib
import sys
import uuid

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[2]))
from httpx import AsyncClient, ASGITransport
from providers.modal_motion.admission import PostgresReceiptStore
from providers.modal_motion.staging import StagingProbe, ProbeRPC, create_app, CPU_ACK
from providers.modal_motion.contracts import MotionContractError
# Fixture utilities do not import or execute the GPU worker.
from verify_modal_admission import sql, seed, uid, payload

IMAGE=b'\x89PNG\r\n\x1a\n'+b'\x00'*32
TOKEN='isolated-fixture-authentication-only'
FIRST,LAST=10021,10028


class Reply(io.BytesIO):status=200


class Opener:
    def __init__(self,prefix,crash=None):self.prefix,self.crash=prefix,crash
    def open(self,request,timeout=10):
        data=json.loads(request.data)
        assert request.get_header('Authorization')=='Bearer fixture-only'
        if request.full_url.endswith('/protocol2_staging_probe'):
            result=sql(self.prefix,"set role service_role;select public.protocol2_staging_probe(:'run'::uuid,:'action',:'job'::uuid,:'event'::jsonb);",{
                'run':data['p_run_id'],'action':data['p_action'],'job':data['p_job_id'] or '',
                'event':json.dumps(data['p_event'])}) if data['p_job_id'] else sql(self.prefix,
                "set role service_role;select public.protocol2_staging_probe(:'run'::uuid,:'action',null,null);",{
                'run':data['p_run_id'],'action':data['p_action']})
        else:
            op=data['p_operation']
            result=sql(self.prefix,"set role service_role;select public.modal_motion_admission(:'job'::uuid,:'op',:'record'::jsonb,:'execution'::boolean);",{
                'job':data['p_job_id'],'op':op,'record':json.dumps(data['p_record']),
                'execution':'true' if data['p_execution'] else 'false'})
            if self.crash=='after_'+op:os._exit(42)
        return Reply((result or 'null').encode())


def probe(prefix,run_id,crash=None):
    store=PostgresReceiptStore('https://isolated-fixture.supabase.co','fixture-only',Opener(prefix,crash))
    def checkpoint(phase):
        if crash==phase:os._exit(42)
    return StagingProbe(lambda:store,ProbeRPC(store,run_id),run_id,'local-'+str(os.getpid()),checkpoint)


def child(prefix,run_id,number,crash=None):
    instance=probe(prefix,run_id,crash)
    import base64
    async def send():
        async with AsyncClient(transport=ASGITransport(app=create_app(instance,TOKEN)),base_url='http://fixture',
            headers={'Authorization':'Bearer '+TOKEN}) as http:
            response=await http.post('/submit',json={'payload':payload(number),
                'image_base64':base64.b64encode(IMAGE).decode(),'ack':CPU_ACK})
            assert response.status_code in (200,202),(response.status_code,response.text)
            assert response.json()['synthetic'] is True
    asyncio.run(send())
    if crash=='lost_submit_reply':os._exit(42)
    assert not any(name in sys.modules for name in ['modal','torch','diffusers','providers.modal_motion.worker'])


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--psql',required=True)
    parser.add_argument('--verify-existing',action='store_true');parser.add_argument('--expect-unavailable',action='store_true')
    args=parser.parse_args()
    if os.environ.get('BEATVISION_PROTOCOL2_TEST_ISOLATED')!='1':raise SystemExit('Explicit isolated fixture acknowledgement required')
    prefix=json.loads(args.psql)
    if not isinstance(prefix,list) or not prefix or not all(isinstance(v,str) for v in prefix):raise SystemExit('Invalid psql argv')
    if args.expect_unavailable:
        instance=probe(prefix,str(uuid.uuid4()))
        try:instance.submit(payload(FIRST),IMAGE,CPU_ACK)
        except MotionContractError as exc:assert str(exc)=='STAGING_DATABASE_UNAVAILABLE'
        else:raise AssertionError('Unavailable ledger granted permission')
        print('PASS: database unavailable fails before reservation or synthetic spawn');return
    run_id=sql(prefix,'select run_id from private.protocol2_staging_environment;')
    instance=probe(prefix,run_id);instance.checked_store()
    context=multiprocessing.get_context('spawn')
    def process(number,crash=None):
        p=context.Process(target=child,args=(prefix,run_id,number,crash));p.start();return p
    def finish(p,expected=0):
        p.join(45)
        if p.is_alive():p.kill();p.join();raise AssertionError('CPU fixture process timeout')
        assert p.exitcode==expected,(p.exitcode,expected)
    def summary(number):return instance.inspect(uid(number))
    def counts(number):
        value=summary(number)
        status=sql(prefix,"select status from public.generation_jobs where id=:'job'::uuid;",{'job':uid(number)})
        assert status=='processing','Synthetic execution must not complete an application job'
        return value['spawn_attempts'],value['fake_model_starts'],value['fake_completions']
    if args.verify_existing:
        for number in range(FIRST,LAST+1):
            before=counts(number);finish(process(number));assert counts(number)==before
        print('PASS: database restart/history retention:8 jobs,0 additional synthetic attempts/model starts');return
    for number in range(FIRST,LAST+1):
        seed(prefix,number)
        sql(prefix,"insert into private.protocol2_staging_jobs values(:'job'::uuid);",{'job':uid(number)})
    contenders=[process(FIRST) for _ in range(20)]
    for p in contenders:finish(p)
    assert counts(FIRST)==(1,1,1)
    for number,crash,expected in [(10022,'after_reserve',(0,0,0)),(10023,'after_acceptance',(1,0,0)),
        (10024,'after_begin',(1,0,0)),(10025,'after_receipt',(1,0,0)),
        (10026,'after_model_start',(1,1,0)),(10027,'lost_submit_reply',(1,1,1))]:
        finish(process(number,crash),42)
        before=summary(number);finish(process(number));assert counts(number)==expected
        after=summary(number);assert after.get('job_id')==before.get('job_id')
    # All event identities remain distinct and every duplicate would be counted.
    finish(process(10028));assert counts(10028)==(1,1,1)
    instance.event(uid(10028),'model_start','fc-staging-'+uuid.uuid4().hex)
    assert counts(10028)==(1,2,1),'Negative duplicate-event oracle must expose both starts'
    sql(prefix,"update private.modal_motion_admissions set created_at=now()-interval '100 years';")
    for number in range(FIRST,LAST+1):
        before=counts(number);finish(process(number));assert counts(number)==before
    # Conflicting fingerprints, unprepared jobs and forged ownership cannot spawn.
    for bad in [{**payload(FIRST),'prompt':'Conflicting creative request'},
                {**payload(FIRST),'project_id':uid(101)},payload(10999)]:
        try:instance.submit(bad,IMAGE,CPU_ACK)
        except MotionContractError:pass
        else:raise AssertionError('Invalid fixture request granted admission')
    assert counts(FIRST)==(1,1,1)
    for role in ['anon','authenticated']:
        sql(prefix,"set role "+role+";select public.protocol2_staging_probe('"+run_id+"','ready');",expected=3)
    for role in ['anon','authenticated','service_role']:
        sql(prefix,'set role '+role+';delete from private.protocol2_staging_events;',expected=3)
    print('PASS:20 independent CPU ASGI processes=1 synthetic spawn/1 model start;6 crash/lost-reply boundaries;'
      '100-year retained claims;duplicate-event negative oracle;ownership/fingerprint/fixture/role guards')


if __name__=='__main__':main()
