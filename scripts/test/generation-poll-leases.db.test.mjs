import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const migration=await readFile(new URL('../../supabase/migrations/20261030010000_generation_poll_leases.sql',import.meta.url),'utf8');
async function setup(dir){
  const db=new PGlite(dir);
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table generation_jobs(id uuid primary key,project_id uuid,status text not null,created_at timestamptz default now(),updated_at timestamptz default now(),input_snapshot jsonb,output jsonb);
    alter table generation_jobs enable row level security;
    grant select on generation_jobs to authenticated;`);
  await db.exec(migration);
  return db;
}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
async function seed(db,n){for(let i=1;i<=n;i++)await db.query(`insert into generation_jobs(id,status,input_snapshot,output,next_poll_at) values($1,'processing','{"frozen":true}',$2,now()-interval '1 day')`,[id(i),i<=8?{reconciliation_required:true}:{upstream_job_id:'fc-existing'}]);}
test('SQL claim selects the ninth recoverable job after eight holds and covers a finite backlog',async()=>{
  const db=await setup();try{
    await seed(db,41);let selected=[];
    for(let i=0;i<6;i++)selected.push(...(await db.query('select * from claim_generation_poll(null,8)')).rows);
    assert.equal(selected.length,41);assert.equal(new Set(selected.map(r=>r.id)).size,41);
    assert.equal(selected[8].id,id(9));
    assert.equal((await db.query('select * from claim_generation_poll(null,8)')).rows.length,0);
    assert.ok(selected.every(r=>r.poll_lease_token && r.poll_lease_until && r.next_poll_at));
    assert.ok(selected.every(r=>r.input_snapshot.frozen===true));
  }finally{await db.close();}
});
test('claim survives disk database restart; expired lease changes token and fences stale workers',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bv-poll-leases-'));let db;
  try{
    db=await setup(dir);await seed(db,1);
    const old=(await db.query('select * from claim_generation_poll($1,1)',[id(1)])).rows[0];
    await db.close();db=new PGlite(dir);
    assert.equal((await db.query('select * from claim_generation_poll($1,1)',[id(1)])).rows.length,0);
    await db.query("update generation_jobs set poll_lease_until=now()-interval '1 second',next_poll_at=now()-interval '1 second' where id=$1",[id(1)]);
    const current=(await db.query('select * from claim_generation_poll($1,1)',[id(1)])).rows[0];
    assert.notEqual(current.poll_lease_token,old.poll_lease_token);
    assert.equal((await db.query("update generation_jobs set status='failed' where id=$1 and poll_lease_token=$2 returning id",[id(1),old.poll_lease_token])).rows.length,0);
    assert.equal((await db.query('select input_snapshot from generation_jobs')).rows[0].input_snapshot.frozen,true);
  }finally{if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});
test('poll reservation RPC is service-only and client mutation grants remain revoked',async()=>{
  const db=await setup();try{
    await seed(db,1);
    for(const role of ['anon','authenticated']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from claim_generation_poll(null,8)'),/permission denied/);
      await assert.rejects(db.query("update generation_jobs set status='queued'"),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await db.query('select * from claim_generation_poll(null,8)')).rows.length,1);
  }finally{await db.close();}
});
