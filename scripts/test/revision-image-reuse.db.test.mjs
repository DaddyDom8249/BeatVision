import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {database,readMigration} from './pglite-runtime.mjs';
const ids={o:'31000000-0000-4000-8000-000000000001',p:'31000000-0000-4000-8000-000000000002',w:'31000000-0000-4000-8000-000000000003',s:'31000000-0000-4000-8000-000000000004',song:'31000000-0000-4000-8000-000000000005',v:'31000000-0000-4000-8000-000000000006',old:'31000000-0000-4000-8000-000000000007',new:'31000000-0000-4000-8000-000000000008'};let db,choices;
test.before(async()=>{
 db=await database();await db.exec(await readMigration('20261014021400_atomic_visual_plan_revisions.sql'));
 await db.exec('alter table scene_image_assets add column storage_path text;');await db.exec(await readMigration('20261006042846_scene_image_persistence.sql'));await db.exec(await readMigration('20261026010325_durable_generation_batches.sql'));
 await db.exec(await readFile(process.env.REVISION_REUSE_MIGRATION || new URL('../../supabase/migrations/20261026071054_revision_image_reuse_provenance.sql',import.meta.url),'utf8'));await db.exec('grant select on scene_image_assets to authenticated;');
 await db.exec(`insert into projects(id,owner_id,world_report_id) values('${ids.p}','${ids.o}','${ids.w}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${ids.w}','${ids.p}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${ids.s}','${ids.p}','${ids.w}','approved',now());
 insert into songs(id,project_id,analysis_status) values('${ids.song}','${ids.p}','completed');
 insert into vision_locks values('${ids.v}','${ids.p}','${ids.w}','${ids.s}','${ids.song}',1,'locked','{}');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,revision_number,status,locked_at) values('${ids.old}','${ids.p}','${ids.w}','${ids.s}','${ids.song}','${ids.v}',1,'approved',now());
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,revision_number,parent_plan_id,status,locked_at) values('${ids.new}','${ids.p}','${ids.w}','${ids.s}','${ids.song}','${ids.v}',2,'${ids.old}','approved',now());`);
 choices=[];for(let i=1;i<=55;i++){
  const make=async plan=>(await db.query(`insert into visual_plan_scenes(project_id,visual_plan_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,visual_direction,location,movement_direction,camera_direction,status) values($1,$2,$3,$4,$5,$6,$7,$8,'Same shot','Approved appearance','Approved setting',$9,$10,'approved') returning *`,[ids.p,plan,ids.w,ids.s,ids.song,i,(i-1)*5,i*5,plan===ids.old?'subtle gestures':'Lift the left hand.',plan===ids.old?'Slow':'Slow push in.'])).rows[0];
  const source=await make(ids.old),target=await make(ids.new);
  const job=(await db.query(`insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,input_snapshot) values($1,$2,$3,$4,'scene_image','completed',$5) returning id`,[ids.p,ids.old,source.id,ids.v,JSON.stringify({scene:source,visual_plan_id:ids.old,visual_plan_scene_id:source.id,vision_snapshot:{},schema_version:1})])).rows[0].id;
  const asset=(await db.query(`insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,storage_path,status,approved) values($1,$2,$3,$4,'original-provider','original-model','https://fixture.test/original.png',$5,'approved',true) returning id`,[ids.p,ids.old,source.id,job,ids.p+'/scene-images/'+source.id+'.png'])).rows[0].id;
  choices.push({scene_id:target.id,source_asset_id:asset});
 }
});
test.after(()=>db?.close());test.beforeEach(()=>db.exec(`begin;set local request.jwt.claim.sub='${ids.o}';set local role authenticated;`));test.afterEach(()=>db.exec('rollback'));
const reuse=(items=choices)=>db.query('select reuse_revision_images($1,$2) n',[ids.new,JSON.stringify(items)]);
test('55existingimages are linked with no new generation or creative approval',async()=>{
 assert.equal((await reuse()).rows[0].n,55);assert.equal((await reuse()).rows[0].n,0);
 const rows=(await db.query('select * from scene_image_assets where visual_plan_id=$1',[ids.new])).rows;
 assert.equal(rows.length,55);assert.ok(rows.every(x=>x.generation_job_id===null&&x.source_generation_job_id&&x.reused_from_image_id&&x.status==='generated'&&!x.approved));
 assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,55);
 assert.equal((await db.query('select count(*)::int n from scene_image_assets where visual_plan_id=$1 and approved',[ids.old])).rows[0].n,55);
});
test('reusedimage can be explicitly approved; new motion freezes current direction and original provenance',async()=>{
 await reuse([choices[0]]);const a=(await db.query('select * from scene_image_assets where visual_plan_id=$1',[ids.new])).rows[0];
 await db.query('select approve_scene_image_asset($1)',[a.id]);await db.exec('reset role');
 const base=(await db.query('select motion_snapshot_for_image($1) base',[a.id])).rows[0].base;
 assert.equal(base.visual_plan_id,ids.new);assert.equal(base.input_snapshot.scene.id,choices[0].scene_id);assert.equal(base.input_snapshot.scene.movement_direction,'Lift the left hand.');assert.equal(base.input_snapshot.image_reuse.source_image_asset_id,choices[0].source_asset_id);
});
test('appearance change blocks reuse without touching source',async()=>{
 await db.exec('reset role;alter table visual_plan_scenes disable trigger visual_plan_scenes_immutable;');await db.query("update visual_plan_scenes set location='Different setting' where id=$1",[choices[0].scene_id]);await db.exec('set local role authenticated');await assert.rejects(reuse([choices[0]]),/IMAGE_REUSE_INCOMPATIBLE/);
});
test('anotherowner and anonymous callers cannot reuse or resolve internal snapshots',async()=>{
 await db.exec("set local request.jwt.claim.sub='31000000-0000-4000-8000-000000000099'");await assert.rejects(reuse(),/REVISION_MEDIA_FORBIDDEN/);
});
test('internal provenance helper is not exposed to clients',async()=>{
 assert.equal((await db.query("select has_function_privilege('authenticated','public.motion_snapshot_for_image(uuid)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.reuse_revision_images(uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
});
test('late incompatible choice rolls back all prior aliases',async()=>{
 await db.exec('savepoint attempt');await assert.rejects(reuse([choices[0],{...choices[1],source_asset_id:choices[0].source_asset_id}]),/INCOMPATIBLE/);await db.exec('rollback to attempt');assert.equal((await db.query('select count(*)::int n from scene_image_assets where visual_plan_id=$1',[ids.new])).rows[0].n,0);
});
test('batch motion uses current revision directions after explicit image review',async()=>{
 await reuse();const assets=(await db.query('select id from scene_image_assets where visual_plan_id=$1',[ids.new])).rows;
 for(const a of assets)await db.query('select approve_scene_image_asset($1)',[a.id]);
 const result=await db.query("select to_jsonb(start_generation_batch($1,'motion',true)) batch",[ids.new]);assert.equal(result.rows[0].batch.status,'running');
 const jobs=(await db.query("select input_snapshot,visual_plan_id from generation_jobs where job_type='scene_motion'")).rows;
 assert.equal(jobs.length,55);assert.ok(jobs.every(j=>j.visual_plan_id===ids.new&&j.input_snapshot.scene.movement_direction==='Lift the left hand.'&&j.input_snapshot.image_reuse.source_generation_job_id));
});
test('reuse retires only the paused duplicate-image batch items without fake completed jobs',async()=>{
 await db.exec('reset role');const batch=(await db.query("insert into generation_batches(project_id,visual_plan_id,kind,status) values($1,$2,'image','paused') returning id",[ids.p,ids.new])).rows[0].id;
 const pending=(await db.query("insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,input_snapshot) values($1,$2,$3,$4,'scene_image','queued','{}') returning id",[ids.p,ids.new,choices[0].scene_id,ids.v])).rows[0].id;
 await db.query('insert into generation_batch_items(batch_id,project_id,scene_id,scene_number,job_id) values($1,$2,$3,1,$4)',[batch,ids.p,choices[0].scene_id,pending]);await db.exec('set local role authenticated');
 await reuse([choices[0]]);assert.equal((await db.query('select status from generation_batches where id=$1',[batch])).rows[0].status,'completed');await db.exec('reset role');assert.equal((await db.query('select generation_batch_dispatch_allowed($1) allowed',[pending])).rows[0].allowed,false);assert.equal((await db.query('select status from generation_jobs where id=$1',[pending])).rows[0].status,'queued');
});
