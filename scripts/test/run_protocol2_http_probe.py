"""Offline-only protocol2 HTTP/crash campaign. Default is a non-executing plan.

No live switch, URL, credential, arbitrary PID or external command is accepted.
The PostgreSQL mode is guarded by the existing isolated CI fixture contract.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime,timezone

ROOT=pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from providers.modal_motion.probe_client import payload_digest
from providers.modal_motion.tests.http_probe_fixture import ci_sql,create_sqlite,payload,uid
from providers.modal_motion.tests.probe_campaign import CASE_IDS,campaign


def prepare_postgres(run):
    sql=ci_sql()
    from verify_modal_admission import seed,payload as prepared_payload
    actual=sql(['psql'],'select run_id from private.protocol2_staging_environment;')
    if actual!=run:raise ValueError('ISOLATED_RUN_ID_MISMATCH')
    values=[prepared_payload(10031+i) for i in range(12)]
    for value in values:
        # Fixture UUIDs encode decimal digits in their last group.
        number=int(value['generation_job_id'].rsplit('-',1)[1])
        seed(['psql'],number)
        sql(['psql'],"insert into private.protocol2_staging_jobs values(:'job'::uuid);",{'job':value['generation_job_id']})
    sql(['psql'],"update generation_jobs set input_snapshot=jsonb_set(input_snapshot,'{modal_motion,admission_protocol}','1') where id=:'job'::uuid;",
        {'job':values[10]['generation_job_id']})
    return {'mode':'postgres_ci_fixture','run_id':run,
        'request_hashes':{v['generation_job_id']:payload_digest(v) for v in values}},values


def postgres_restore(backend):
    ci_sql() # No arbitrary DB/host/user/command accepted.
    with tempfile.TemporaryDirectory(prefix='protocol2-http-backup-') as directory:
        archive=str(pathlib.Path(directory)/'fixture.dump')
        for command in [['pg_dump','-Fc','-f',archive],['createdb','http_controller_restored'],
            ['pg_restore','--exit-on-error','--clean','--if-exists','-d','http_controller_restored',archive]]:
            result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=45)
            if result.returncode:raise RuntimeError('ISOLATED_DATABASE_RESTORE_FAILED')
    os.environ['PGDATABASE']='http_controller_restored'
    return backend


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group()
    mode.add_argument('--offline',action='store_true',help='owned loopback workers and disposable SQLite simulation')
    mode.add_argument('--ci-postgres',action='store_true',help='existing isolated CI fixture only')
    parser.add_argument('--evidence',type=pathlib.Path)
    args=parser.parse_args(argv)
    plan={'decision':'LIVE_BLOCKED','live_authorizer':'NOT_CONFIGURED','remote_crash_controller':'NOT_IMPLEMENTED',
        'case_ids':list(CASE_IDS),'default_execution':'NONE','limits':{'POST':64,'GET':48,'total':112,'seconds':180}}
    if not args.offline and not args.ci_postgres:
        print(json.dumps(plan,sort_keys=True));return 0
    if args.evidence is None:parser.error('--evidence is required for a campaign')
    # Never overwrite an existing evidence file or follow a symlink.
    with args.evidence.open('x',encoding='utf-8') as output:
        os.chmod(args.evidence,0o600)
        head=subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,text=True,capture_output=True,check=True).stdout.strip()
        started=datetime.now(timezone.utc).isoformat()
        source_paths=sorted((ROOT/'providers/modal_motion').glob('probe_*.py'))+[
            ROOT/'providers/modal_motion'/name for name in
            ['protocol.py','admission.py','staging.py','contracts.py','staging_modal.py']]+[
            ROOT/'providers/modal_motion/tests'/name for name in
            ['http_probe_fixture.py','http_probe_worker.py','probe_campaign.py']]+[pathlib.Path(__file__)]
        source_hashes={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in source_paths}
        partial={}
        try:
            with tempfile.TemporaryDirectory(prefix='protocol2-http-') as directory:
                if args.ci_postgres:
                    sql=ci_sql();run=sql(['psql'],'select run_id from private.protocol2_staging_environment;')
                    backend,values=prepare_postgres(run)
                else:
                    values=[payload(10031+i) for i in range(12)]
                    backend=create_sqlite(directory,str(uuid.uuid4()),values,[values[10]['generation_job_id']])
                evidence=campaign(backend,values,head,restore=postgres_restore if args.ci_postgres else None,evidence=partial)
        except Exception:
            json.dump({**partial,**plan,'offline_result':'FAIL','started_utc':started,'source_commit':head,
                'source_hashes':source_hashes,'error':'OFFLINE_CAMPAIGN_FAILED'},output,indent=2)
            raise
        evidence.update({'started_utc':started,'finished_utc':datetime.now(timezone.utc).isoformat(),
            'source_hashes':source_hashes,'command':sys.argv,'exit_code':0})
        json.dump(evidence,output,indent=2);output.write('\n')
    print(json.dumps({'offline_cases':len(evidence['cases']),'requests':evidence['budget_used'],
        'decision':evidence['decision'],'all_owned_workers_stopped':True}))
    return 0


if __name__=='__main__':raise SystemExit(main())
