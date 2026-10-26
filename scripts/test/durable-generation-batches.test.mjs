import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database,readMigration} from './pglite-runtime.mjs';
import {modalFramesForScene} from '../../supabase/functions/beatvision-generation/modal-motion.ts';
const migration=process.env.BRAGORA_BATCH_MIGRATION||new URL('../../supabase/migrations/20261026010325_durable_generation_batches.sql',import.meta.url);
const ids={p:'21000000-0000-4000-8000-000000000001',o:'21000000-0000-4000-8000-000000000002',w:'21000000-0000-4000-8000-000000000003',s:'21000000-0000-4000-8000-000000000004',song:'21000000-0000-4000-8000-000000000005',l:'21000000-0000-4000-8000-000000000006',plan:'21000000-0000-4000-8000-000000000007'};
let db;
test.before(async()=>{db=await database();await db.exec(`alter table scene_image_assets add column storage_path text;
 alter table generation_jobs add column provider text,add column provider_job_id text,
 add column submitted_at timestamptz,add column processing_at timestamptz,add column completed_at timestamptz,add column failed_at timestamptz;`);
 const contract=await readMigration('20261004090252_generation_jobs.sql');
 const offset=contract.indexOf('create or replace function public.enforce_generation_job_contract()');
 await db.exec(contract.slice(offset,contract.indexOf('$$;',offset)+3));
 await db.exec('create trigger generation_jobs_contract before insert or update on generation_jobs for each row execute function enforce_generation_job_contract();');await db.exec(await readFile(migration,'utf8'));
 await db.exec(`insert into projects values('${ids.p}','${ids.o}','${ids.w}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${ids.w}','${ids.p}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${ids.s}','${ids.p}','${ids.w}','approved',now());
 insert into songs(id,project_id,analysis_status,analysis) values('${ids.song}','${ids.p}','completed','{"duration_seconds":285}');
 insert into vision_locks values('${ids.l}','${ids.p}','${ids.w}','${ids.s}','${ids.song}',1,'locked','{}');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,locked_at,duration_seconds) values('${ids.plan}','${ids.p}','${ids.w}','${ids.s}','${ids.song}','${ids.l}','approved',now(),285);
 insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,status)
 select '${ids.plan}','${ids.p}','${ids.w}','${ids.s}','${ids.song}',i,(i-1)*5,i*5,'Shot '||i,'approved' from generate_series(1,57) i;`);
});
test.after(async()=>db?.close());
test.beforeEach(async()=>db.exec(`begin;set local request.jwt.claim.sub='${ids.o}';`));
test.afterEach(async()=>db.exec('rollback'));
const start=async(kind='image',terms=false)=>(await db.query('select * from start_generation_batch($1,$2,$3)',[ids.plan,kind,terms])).rows[0];
const progress=async()=>(await db.query('select get_generation_batch_progress($1) state',[ids.plan])).rows[0].state;
const queue=async()=>(await db.query('select * from get_generation_dispatch_queue(8)')).rows;

test('one click persists all57 frozen jobs; independent scheduler ticks finish without a browser',async()=>{
 const batch=await start();assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,57);
 assert.equal((await start()).id,batch.id);
 for(let i=0;i<57;i++){
  const jobs=await queue();assert.equal(jobs.length,1);assert.equal(jobs[0].input_snapshot.scene.scene_number,i+1);
  assert.equal(jobs[0].input_snapshot.generation_batch_id,batch.id);
  assert.equal((await db.query('select generation_batch_dispatch_allowed($1) ok',[jobs[0].id])).rows[0].ok,true);
  await db.query("update generation_jobs set status='submitted',provider='fixture',provider_job_id=id::text where id=$1",[jobs[0].id]);
  await db.query("update generation_jobs set status='processing' where id=$1",[jobs[0].id]);assert.equal((await queue()).length,0);
  await db.query("update generation_jobs set status='completed' where id=$1",[jobs[0].id]);
  const p=(await progress())[0];assert.equal(p.done,i+1);assert.equal(p.total,57);
 }
 assert.equal((await queue()).length,0);assert.equal((await progress())[0].status,'completed');
 assert.equal((await db.query('select count(*)::int n from scene_image_assets')).rows[0].n,0);
});
test('manual pause blocks queued dispatch, allows persisted progress and explicit resume',async()=>{
 const batch=await start();await db.query('select set_generation_batch_paused($1,true)',[batch.id]);assert.equal((await queue()).length,0);
 assert.equal((await progress())[0].status,'paused');await db.query('select set_generation_batch_paused($1,false)',[batch.id]);assert.equal((await queue()).length,1);
});
test('failure pauses57-job batch without retrying or dispatching later jobs',async()=>{
 const batch=await start();const [first]=await queue();await db.query("update generation_jobs set status='failed',error='{"+'"code":"QUOTA_EXHAUSTED"'+"}' where id=$1",[first.id]);
 assert.equal((await queue()).length,0);assert.equal((await progress())[0].failed,1);assert.equal((await progress())[0].status,'paused');
 await assert.rejects(db.query('select set_generation_batch_paused($1,false)',[batch.id]),/INDIVIDUAL_RETRY_REQUIRED/);
});
test('other owners cannot start/pause/read batches and direct table writes remain denied',async()=>{
 const batch=await start();await db.exec("set local request.jwt.claim.sub='21000000-0000-4000-8000-000000000099'; set local role authenticated;");
 assert.equal((await db.query('select * from generation_batches')).rows.length,0);assert.equal((await db.query('select * from generation_batch_items')).rows.length,0);
 for(const [sql,args] of [['select start_generation_batch($1,\'image\',false)',[ids.plan]],['select get_generation_batch_progress($1)',[ids.plan]],['select set_generation_batch_paused($1,true)',[batch.id]]]){
  await db.exec('savepoint denied');await assert.rejects(db.query(sql,args),/FORBIDDEN/);await db.exec('rollback to denied');
 }
 assert.equal((await db.query("select has_table_privilege('authenticated','generation_batches','UPDATE') allowed")).rows[0].allowed,false);
});
test('service dispatch RPCs and anonymous batch starts are denied',async()=>{
 for(const name of ['get_generation_dispatch_queue(integer)','generation_batch_dispatch_allowed(uuid)']){
  for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,name])).rows[0].allowed,false);
 }
 assert.equal((await db.query("select has_function_privilege('anon','start_generation_batch(uuid,text,boolean)','EXECUTE') allowed")).rows[0].allowed,false);
});
test('missing motion prerequisites rolls back the entire batch and every job',async()=>{
 await assert.rejects(start('motion',true),/APPROVED_IMAGE_REQUIRED/);await db.exec('rollback;begin;');
 assert.equal((await db.query('select count(*)::int n from generation_batches')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,0);
});
async function seedImages(){
 const sceneRows=(await db.query('select * from visual_plan_scenes order by scene_number')).rows;
 for(const s of sceneRows){
  const j=(await db.query("insert into generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,status,input_snapshot,provider,provider_job_id) values($1,$2,$3,$4,'scene_image','completed',$5,'fixture','fixture-job') returning id",[ids.p,ids.l,ids.plan,s.id,{scene:{...s,start_time:Number(s.start_time),end_time:Number(s.end_time)},vision_snapshot:{},schema_version:1}])).rows[0];
  // The canonical asset guard requires owner-consistent generated lineage.
  await db.query("insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved) values($1,$2,$3,$4,'fixture','fixture','https://fixture.test/a.png',$5,'approved',true)",[ids.p,ids.plan,s.id,j.id,ids.p+'/scene-images/'+s.id+'.png']);
 }
 return sceneRows;
}
test('motion freezes57 approved sources and frame counts matching the real Modal adapter',async()=>{
 const rows=await seedImages();const batch=await start('motion',true);const jobs=(await db.query("select * from generation_jobs where job_type='scene_motion' order by input_snapshot#>>'{scene,scene_number}'")).rows;
 assert.equal(jobs.length,57);for(const j of jobs){assert.equal(j.input_snapshot.generation_batch_id,batch.id);assert.equal(j.input_snapshot.modal_motion.frames,modalFramesForScene(j.input_snapshot.scene,k=>k==='BRAGORA_MODAL_MAX_FRAMES'?'121':''));assert.equal(j.input_snapshot.modal_motion.model,'Lightricks/LTX-Video-0.9.5');}
 assert.equal((await queue()).length,1);assert.equal(rows.length,57);
});
test('motion terms are required and long scenes reject before creating a batch',async()=>{
 await assert.rejects(start('motion',false),/TERMS_REQUIRED/);
 await db.exec(`rollback;begin;set local request.jwt.claim.sub='${ids.o}';alter table visual_plan_scenes disable trigger visual_plan_scenes_immutable;`);await db.query('update visual_plan_scenes set end_time=52 where scene_number=1');
 await assert.rejects(start('motion',true),/SHORT_SHOT_REVISION_REQUIRED/);
});
test('paused batch does not starve unrelated individual jobs',async()=>{
 const batch=await start();await db.query('select set_generation_batch_paused($1,true)',[batch.id]);
 const extra=(await db.query("insert into generation_jobs(project_id,vision_lock_id,visual_plan_id,job_type,input_snapshot) values($1,$2,$3,'scene_image','{}') returning id",[ids.p,ids.l,ids.plan])).rows[0];
 assert.deepEqual((await queue()).map(j=>j.id),[extra.id]);
});
test('existing approved images are skipped without changing media, approvals or frozen jobs',async()=>{
 await seedImages();const before=(await db.query('select * from scene_image_assets order by id')).rows;
 const jobsBefore=(await db.query('select * from generation_jobs order by id')).rows;
 const batch=await start();assert.equal(batch.status,'completed');assert.equal((await progress())[0].done,57);
 assert.deepEqual((await db.query('select * from scene_image_assets order by id')).rows,before);
 assert.deepEqual((await db.query('select * from generation_jobs order by id')).rows,jobsBefore);
});
test('a late prerequisite failure rolls back already prepared motion jobs atomically',async()=>{
 await seedImages();const last=(await db.query('select id from visual_plan_scenes where scene_number=57')).rows[0];
 await db.query("update scene_image_assets set status='generated',approved=false where scene_id=$1",[last.id]);
 await db.exec('savepoint before_batch');await assert.rejects(start('motion',true),/APPROVED_IMAGE_REQUIRED/);await db.exec('rollback to before_batch');
 assert.equal((await db.query("select count(*)::int n from generation_jobs where job_type='scene_motion'")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from generation_batches')).rows[0].n,0);
});
test('explicit resume recognizes individual regeneration without rewriting the failed job',async()=>{
 const batch=await start();const [first]=await queue();await db.query("update generation_jobs set status='failed' where id=$1",[first.id]);await queue();
 const frozen=(await db.query('select * from generation_jobs where id=$1',[first.id])).rows[0];
 const replacement=(await db.query("insert into generation_jobs(project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,input_snapshot,provider,provider_job_id,status) select project_id,vision_lock_id,visual_plan_id,visual_plan_scene_id,job_type,input_snapshot-'generation_batch_id','fixture','individual-retry','completed' from generation_jobs where id=$1 returning id",[first.id])).rows[0];
 await db.query("insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved) values($1,$2,$3,$4,'fixture','fixture','https://fixture.test/retry.png',$5,'generated',false)",[ids.p,ids.plan,first.visual_plan_scene_id,replacement.id,ids.p+'/scene-images/retry.png']);
 await db.query('select set_generation_batch_paused($1,false)',[batch.id]);assert.equal((await progress())[0].done,1);assert.equal((await queue())[0].input_snapshot.scene.scene_number,2);
 assert.deepEqual((await db.query('select * from generation_jobs where id=$1',[first.id])).rows[0],frozen);
 assert.equal((await db.query('select approved from scene_image_assets where generation_job_id=$1',[replacement.id])).rows[0].approved,false);
});
