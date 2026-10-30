import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {PGlite} from '@electric-sql/pglite';
const fixture=await readFile(new URL('./sql/generation-enqueue-fixture.sql',import.meta.url),'utf8');
const migration=await readFile(new URL('../../supabase/migrations/20261030204115_durable_modal_admission.sql',import.meta.url),'utf8');
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const request={admission_protocol:2,generation_job_id:id(1),project_id:id(100),scene_id:id(300),source_image_id:id(800),
  image_sha256:'a'.repeat(64),prompt:'Approved frozen request',seed:42};
const record={fingerprint:'b'.repeat(64),state:'receipt_unknown',admission_token:id(2),request};
async function seed(db,jobId=id(1),protocol=2){
  const payload={...request,generation_job_id:jobId};
  await db.query(`insert into generation_jobs(id,project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,status,input_snapshot,output)
    values($1,$2,$3,$4,$5,'scene_motion','processing',$6,$7)`,[jobId,id(100),id(400),id(200),id(300),
      {modal_motion:{source_image_id:id(800),admission_protocol:protocol,model:'Lightricks/LTX-Video-0.9.5',revision:'e58e28c39631af4d1468ee57a853764e11c1d37e'}},
      {modal_source_sha256:request.image_sha256,modal_dispatch_payload:payload,dispatch_intent:{request_id:'beatvision:'+jobId}}]);
}
async function setup(dir){const db=new PGlite(dir);await db.exec(fixture);await seed(db,id(9),1);await db.exec(migration);await seed(db);return db;}
async function rpc(db,op,value=record,execution=false,job=id(1)){
  return (await db.query('select modal_motion_admission($1,$2,$3,$4) as value',[job,op,value,execution])).rows[0].value;
}
const receipt={fingerprint:record.fingerprint,state:'accepted',admission_token:record.admission_token,job_id:'fc-existing'};

test('permanent reserve grants once, retains exact request, and never regrants same-token retries',async()=>{
  const db=await setup();try{
    assert.equal(await rpc(db,'reserve'),true);
    assert.equal(await rpc(db,'reserve'),false);
    assert.equal(await rpc(db,'reserve',{...record,admission_token:id(3)}),false);
    assert.deepEqual(await rpc(db,'lookup',null),record);
    await db.exec("update private.modal_motion_admissions set created_at=now()-interval '100 years'");
    assert.equal(await rpc(db,'reserve'),false);
    await assert.rejects(rpc(db,'reserve',{...record,fingerprint:'c'.repeat(64)}),/FINGERPRINT_CONFLICT/);
    await assert.rejects(rpc(db,'reserve',{...record,request:{...request,project_id:id(101)}}),/LINEAGE_INVALID/);
  }finally{await db.close();}
});

test('execution admission is one-shot, same-call retry fails, and late receipt cannot erase execution fence',async()=>{
  const db=await setup();try{
    await rpc(db,'reserve');assert.equal(await rpc(db,'begin',receipt,true),true);
    assert.equal(await rpc(db,'begin',receipt,true),false);
    assert.equal(await rpc(db,'receipt',receipt),true);assert.equal(await rpc(db,'receipt',receipt),true);
    assert.deepEqual(await rpc(db,'lookup',null,true),receipt);
    const parent=await rpc(db,'lookup',null);assert.deepEqual(parent.request,request);assert.equal(parent.job_id,'fc-existing');
    for(const bad of [{...receipt,job_id:'fc-conflict'},{...receipt,admission_token:id(3)}])
      await assert.rejects(rpc(db,'receipt',bad),/IDENTITY_INVALID|RECEIPT_CONFLICT/);
  }finally{await db.close();}
});

test('caller receipt commit before delayed worker start retains exact authorization and token',async()=>{
  const db=await setup();try{
    await rpc(db,'reserve');await rpc(db,'receipt',receipt);
    assert.equal(await rpc(db,'begin',receipt,true),true);
    assert.equal(await rpc(db,'begin',receipt,true),false);
    await assert.rejects(rpc(db,null,receipt),/OPERATION_INVALID/);
    await assert.rejects(rpc(db,'begin',receipt,null),/OPERATION_INVALID/);
  }finally{await db.close();}
});

test('a provider receipt bound to one job cannot be replayed onto another job',async()=>{
  const db=await setup();try{
    await rpc(db,'reserve');await rpc(db,'begin',receipt,true);
    await seed(db,id(11));await rpc(db,'reserve',{...record,request:{...request,generation_job_id:id(11)}},false,id(11));
    await assert.rejects(rpc(db,'receipt',receipt,false,id(11)),/RECEIPT_REPLAY|unique constraint/);
    assert.equal((await rpc(db,'lookup',null,false,id(11))).job_id,undefined);
  }finally{await db.close();}
});

test('database restart retains non-expiring unknown and executed claims',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'bv-modal-ledger-'));let db;
  try{
    db=await setup(dir);await rpc(db,'reserve');await db.close();db=new PGlite(dir);
    assert.equal(await rpc(db,'reserve'),false);assert.equal(await rpc(db,'begin',receipt,true),true);
    await db.close();db=new PGlite(dir);assert.equal(await rpc(db,'begin',receipt,true),false);
    assert.equal((await rpc(db,'lookup',null,true)).job_id,'fc-existing');
  }finally{if(db)await db.close();await rm(dir,{recursive:true,force:true});}
});

test('legacy jobs are quarantined before and after migration; missing job cannot gain permission',async()=>{
  const db=await setup();try{
    const legacy={...record,request:{...request,generation_job_id:id(9)}};
    assert.equal(await rpc(db,'reserve',legacy,false,id(9)),false);
    assert.equal((await rpc(db,'lookup',null,false,id(9))).legacy_hold,true);
    await assert.rejects(rpc(db,'begin',receipt,true,id(9)),/IDENTITY_INVALID/);
    await seed(db,id(10),1);
    assert.equal(await rpc(db,'reserve',{...record,request:{...request,generation_job_id:id(10)}},false,id(10)),false);
    await assert.rejects(rpc(db,'reserve',record,false,id(999)),/JOB_UNAVAILABLE/);
  }finally{await db.close();}
});

test('project deletion retains tombstone, blocks model entry, and leaves client roles unable to mutate or reset it',async()=>{
  const db=await setup();try{
    await rpc(db,'reserve');await db.query('delete from projects where id=$1',[id(100)]);
    await assert.rejects(rpc(db,'begin',receipt,true),/AUTHORIZATION_INVALID/);
    assert.equal(await rpc(db,'receipt',receipt),true);
    for(const role of ['anon','authenticated','service_role']){
      await db.exec('set role '+role);
      await assert.rejects(db.exec('delete from private.modal_motion_admissions'),/permission denied/);
      if(role!=='service_role')await assert.rejects(rpc(db,'reserve'),/permission denied/);
      await db.exec('reset role');
    }
    assert.equal((await rpc(db,'lookup',null)).job_id,'fc-existing');
  }finally{await db.close();}
});

test('malformed grants, altered frozen request, unapproved source and invalid tokens fail closed',async()=>{
  const db=await setup();try{
    for(const bad of [{},{...record,fingerprint:null},{...record,admission_token:'invalid'},
      {...record,request:{...request,prompt:'Changed creative direction'}}])await assert.rejects(rpc(db,'reserve',bad));
    await db.exec("update scene_image_assets set approved=false where id='"+id(800)+"'");
    await assert.rejects(rpc(db,'reserve'),/SOURCE_UNAPPROVED/);
    assert.equal(await rpc(db,'lookup',null),null);
  }finally{await db.close();}
});

test('model entry rejects changed current lineage, model, protocol, source hash or approvals',async()=>{
  const changes=[
    `insert into visual_plan_scenes(id,project_id,visual_plan_id,status) values('${id(301)}','${id(100)}','${id(200)}','approved');update generation_jobs set visual_plan_scene_id='${id(301)}' where id='${id(1)}'`,
    `update generation_jobs set input_snapshot=jsonb_set(input_snapshot,'{modal_motion,source_image_id}','"${id(801)}"') where id='${id(1)}'`,
    `update generation_jobs set input_snapshot=jsonb_set(input_snapshot,'{modal_motion,model}','"other-model"') where id='${id(1)}'`,
    `update generation_jobs set input_snapshot=jsonb_set(input_snapshot,'{modal_motion,revision}','"other-revision"') where id='${id(1)}'`,
    `update generation_jobs set input_snapshot=jsonb_set(input_snapshot,'{modal_motion,admission_protocol}','1') where id='${id(1)}'`,
    `update generation_jobs set output=jsonb_set(output,'{modal_source_sha256}','"changed-hash"') where id='${id(1)}'`,
    `update visual_plan_scenes set status='draft' where id='${id(300)}'`,
    `update visual_plans set status='draft' where id='${id(200)}'`,
  ];
  for(const change of changes){const db=await setup();try{
    await rpc(db,'reserve');await db.exec(change);
    await assert.rejects(rpc(db,'begin',receipt,true),/AUTHORIZATION_INVALID/);
    assert.equal(await rpc(db,'lookup',null,true),null);
  }finally{await db.close();}}
});
