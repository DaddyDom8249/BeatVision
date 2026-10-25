import test from 'node:test';
import assert from 'node:assert/strict';
import {database,readMigration} from './pglite-runtime.mjs';
const id=n=>'22000000-0000-4000-8000-'+String(n).padStart(12,'0');
const p=id(1),o=id(2),w=id(3),st=id(4),song=id(5),lock=id(6),plan=id(7),scene=id(8);
let db,oldClip,newClip;
test.before(async()=>{
 db=await database();
 await db.exec(await readMigration('20261014021200_creator_asset_choices.sql'));
 await db.exec(await readMigration('20261014021100_assembly_retry_attempts.sql'));
 await db.exec(await readMigration('20261014180000_approved_asset_media_immutability.sql'));
 await db.exec(`set request.jwt.claim.sub='${o}';
 insert into projects values('${p}','${o}','${w}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${w}','${p}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${st}','${p}','${w}','approved',now());
 insert into songs(id,project_id,analysis_status,analysis,audio_path) values('${song}','${p}','completed','{"duration_seconds":5}','owner/song.mp3');
 insert into vision_locks values('${lock}','${p}','${w}','${st}','${song}',1,'locked','{"song":{"audio_path":"owner/song.mp3","analysis":{"duration_seconds":5}}}');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,locked_at,duration_seconds) values('${plan}','${p}','${w}','${st}','${song}','${lock}','approved',now(),5);
 insert into visual_plan_scenes(id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,status) values('${scene}','${plan}','${p}','${w}','${st}','${song}',1,0,5,'Scene','approved');
 insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${p}','${plan}','${scene}','${lock}','scene_image','completed','source-image','{}');
 insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved) select project_id,visual_plan_id,visual_plan_scene_id,id,'fixture','fixture','https://fixture.test/image.jpg','approved',true from generation_jobs where idempotency_key='source-image';
 insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${p}','${plan}','${scene}','${lock}','scene_motion','completed','old-motion','{}'),('${p}','${plan}','${scene}','${lock}','scene_motion','completed','new-motion','{}');
 insert into motion_clip_assets(project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved)
 select j.project_id,j.visual_plan_id,j.visual_plan_scene_id,j.id,i.id,'modal','LTX','https://fixture.test/'||j.idempotency_key||'.mp4',case when j.idempotency_key='old-motion' then 'approved' else 'generated' end,j.idempotency_key='old-motion' from generation_jobs j cross join scene_image_assets i where j.job_type='scene_motion';`);
 const clips=(await db.query('select id,status from motion_clip_assets')).rows;
 oldClip=clips.find(x=>x.status==='approved').id;newClip=clips.find(x=>x.status==='generated').id;
});
test.after(()=>db?.close());
test.beforeEach(()=>db.exec(`begin;set local request.jwt.claim.sub='${o}';`));
test.afterEach(()=>db.exec('rollback'));
const install=async()=>db.exec(await readMigration('20261025175243_motion_variant_selection.sql'));
const choose=(target=newClip,expected=oldClip)=>db.query('select * from replace_approved_motion_clip($1,$2)',[target,expected]);
const assemble=()=>db.query('select * from enqueue_assembly_generation($1,$2)',[p,plan]);

test('reproduces variant2 blocked by existing approval',async()=>{
 await assert.rejects(db.query('select approve_motion_clip_asset($1)',[newClip]),/MOTION_CLIP_ALREADY_APPROVED_USE_PLAN_REVISION/);
});
test('explicit replacement retains both media rows, exactly one approval and immutable decision history',async()=>{
 await install();
 const before=(await db.query('select * from motion_clip_assets order by id')).rows;
 const result=(await choose()).rows[0];assert.equal(result.id,newClip);assert.equal(result.approved,true);
 const after=(await db.query('select * from motion_clip_assets order by id')).rows;
 for(let i=0;i<before.length;i++) for(const key of ['id','video_url','generation_job_id','scene_image_id','project_id','visual_plan_id','scene_id','provider','model'])assert.deepEqual(after[i][key],before[i][key]);
 assert.equal(after.filter(x=>x.approved).length,1);assert.equal(after.find(x=>x.id===oldClip).status,'generated');
 assert.equal((await choose()).rows[0].id,newClip,'same successful choice is idempotent');
 assert.equal((await db.query('select count(*)::int n from motion_clip_approval_history')).rows[0].n,1);
 await assert.rejects(db.query('update motion_clip_approval_history set selected_asset_id=previous_asset_id'),/APPROVAL_HISTORY_IMMUTABLE/);
});
test('another owner cannot replace or read approval history',async()=>{
 await install();await choose();
 await db.exec(`set local request.jwt.claim.sub='${id(99)}';set local role authenticated;`);
 assert.equal((await db.query('select * from motion_clip_approval_history')).rows.length,0);
 await assert.rejects(choose(oldClip,newClip),/NOT_FOUND_OR_FORBIDDEN/);
});
test('stale approval and rejected candidates reject without clearing the old approval',async()=>{
 await install();
 await db.exec('savepoint stale');await assert.rejects(choose(newClip,id(99)),/MOTION_APPROVAL_CHANGED/);await db.exec('rollback to stale');
 await db.query("update motion_clip_assets set status='rejected' where id=$1",[newClip]);
 await db.exec('savepoint rejected');await assert.rejects(choose(),/NOT_APPROVABLE/);await db.exec('rollback to rejected');
 assert.equal((await db.query('select approved from motion_clip_assets where id=$1',[oldClip])).rows[0].approved,true);
});
test('pending assembly protects its frozen approval until it finishes',async()=>{
 await install();const job=(await assemble()).rows[0];
 await assert.rejects(choose(),/MOTION_APPROVAL_ASSEMBLY_IN_PROGRESS/);
});
test('new choice produces a new assembly snapshot and keeps the completed snapshot intact',async()=>{
 await install();const original=(await assemble()).rows[0];
 await db.query("update generation_jobs set status='completed' where id=$1",[original.id]);
 await choose();const next=(await assemble()).rows[0];
 assert.notEqual(next.id,original.id);assert.equal(next.input_snapshot.motion_clips[0].asset_id,newClip);
 assert.deepEqual((await db.query('select input_snapshot from generation_jobs where id=$1',[original.id])).rows[0].input_snapshot,original.input_snapshot);
 assert.equal((await assemble()).rows[0].id,next.id,'unchanged selection does not enqueue twice');
});
test('anonymous execute and direct approval/history writes stay denied',async()=>{
 await install();
 assert.equal((await db.query("select has_function_privilege('anon','replace_approved_motion_clip(uuid,uuid)','EXECUTE') allowed")).rows[0].allowed,false);
 for(const table of ['motion_clip_assets','motion_clip_approval_history'])assert.equal((await db.query(`select has_table_privilege('authenticated','${table}','UPDATE') allowed`)).rows[0].allowed,false);
});

test('a failed or mismatched generating job cannot become the replacement',async()=>{
 await install();
 await db.query("update generation_jobs set status='failed' where idempotency_key='new-motion'");
 await db.exec('savepoint failed_job');await assert.rejects(choose(),/NOT_APPROVABLE/);await db.exec('rollback to failed_job');
 await db.query("update generation_jobs set status='completed',visual_plan_scene_id=null where idempotency_key='new-motion'");
 await db.exec('savepoint mismatch');await assert.rejects(choose(),/NOT_APPROVABLE/);await db.exec('rollback to mismatch');
 assert.equal((await db.query('select approved from motion_clip_assets where id=$1',[oldClip])).rows[0].approved,true);
 assert.equal((await db.query('select count(*)::int n from motion_clip_approval_history')).rows[0].n,0);
});

test('the earlier take can be selected again after replacement without altering its bytes',async()=>{
 await install();await choose();await choose(oldClip,newClip);
 assert.equal((await db.query('select id from motion_clip_assets where approved')).rows[0].id,oldClip);
 assert.equal((await db.query('select count(*)::int n from motion_clip_approval_history')).rows[0].n,2);
});
