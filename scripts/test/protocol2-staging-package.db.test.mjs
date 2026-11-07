import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('staging event RPC accepts local and Modal identities and counts every synthetic attempt',async()=>{
  const db=new PGlite();
  const run='00000000-0000-0000-0000-000000001111',job='00000000-0000-0000-0000-000000010021';
  try{
    for(const file of ['./sql/generation-enqueue-fixture.sql',
      '../../supabase/migrations/20261030204115_durable_modal_admission.sql',
      './sql/protocol2-staging-fixture.sql'])await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
    await db.query('insert into private.protocol2_staging_environment values($1)',[run]);
    await db.query('insert into private.protocol2_staging_jobs values($1)',[job]);
    await db.exec('set role service_role');
    const event=async(worker,number)=>db.query('select protocol2_staging_probe($1,$2,$3,$4)',[run,'event',job,
      {phase:'model_start',worker_id:worker,event_id:'00000000-0000-0000-0000-'+String(number).padStart(12,'0'),
        call_id:'fc-staging-00000000000000000000000000000001'}]);
    await event('local-fixture',1);await event('modal-ta-fixture',2);
    const summary=(await db.query('select protocol2_staging_probe($1,$2,$3,null) as value',[run,'summary',job])).rows[0].value;
    assert.equal(summary.fake_model_starts,2,'Neither event may be hidden by a unique-per-job counter');
    for(const worker of ['ta-without-trusted-prefix','untrusted-fixture','modal-'])
      await assert.rejects(event(worker,3),/STAGING_EVENT_INVALID/);
    await assert.rejects(db.exec('delete from private.protocol2_staging_events'),/permission denied/);
  }finally{await db.close();}
});
