import test from 'node:test';
import assert from 'node:assert/strict';
import { database, readMigration } from './pglite-runtime.mjs';
const ids={owner:'00000000-0000-4000-8000-000000000001',other:'00000000-0000-4000-8000-000000000002',project:'00000000-0000-4000-8000-000000000003',world:'00000000-0000-4000-8000-000000000004',style:'00000000-0000-4000-8000-000000000005',song:'00000000-0000-4000-8000-000000000006',plan:'00000000-0000-4000-8000-000000000007',scene:'00000000-0000-4000-8000-000000000008',lock:'00000000-0000-4000-8000-000000000009'};
let db;
test.before(async()=>{
 db=await database();
 await db.exec(`insert into projects values('${ids.project}','${ids.owner}','${ids.world}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${ids.world}','${ids.project}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${ids.style}','${ids.project}','${ids.world}','approved',now());
 insert into songs(id,project_id,analysis_status,analysis,audio_path) values('${ids.song}','${ids.project}','completed','{"duration_seconds":30,"sections":[{"index":0,"start_time":0,"end_time":30}]}','owner/project/song.mp3');
 insert into vision_locks values('${ids.lock}','${ids.project}','${ids.world}','${ids.style}','${ids.song}',1,'locked','{"song":{"audio_path":"owner/project/song.mp3","analysis":{"duration_seconds":30}}}');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,locked_at,duration_seconds) values('${ids.plan}','${ids.project}','${ids.world}','${ids.style}','${ids.song}','${ids.lock}','approved',now(),30);
 insert into visual_plan_scenes(id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,status) values('${ids.scene}','${ids.plan}','${ids.project}','${ids.world}','${ids.style}','${ids.song}',1,0,30,'Scene','approved');
 insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${ids.project}','${ids.plan}','${ids.scene}','${ids.lock}','scene_image','completed','image-first','{}');
 insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved) select project_id,visual_plan_id,visual_plan_scene_id,id,'fixture','fixture','https://fixture.test/image.jpg','approved',true from generation_jobs where idempotency_key='image-first';
 insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${ids.project}','${ids.plan}','${ids.scene}','${ids.lock}','scene_motion','completed','motion-first','{}');
 insert into motion_clip_assets(project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved) select j.project_id,j.visual_plan_id,j.visual_plan_scene_id,j.id,i.id,'fixture','image-motion','https://fixture.test/motion.mp4','approved',true from generation_jobs j join scene_image_assets i on i.scene_id=j.visual_plan_scene_id where j.idempotency_key='motion-first';
 `);
});
test.after(async()=>db?.close());
test.beforeEach(async()=>{await db.exec(`begin; set local request.jwt.claim.sub='${ids.owner}';`);});
test.afterEach(async()=>db.exec('rollback'));
const enqueue=()=>db.query(`select id,status,input_snapshot from enqueue_assembly_generation('${ids.project}','${ids.plan}')`);

test('reproduces legacy assembly retry returning the same failed attempt',async()=>{
 const first=(await enqueue()).rows[0];
 await db.query("update generation_jobs set status='failed' where id=$1",[first.id]);
 const retry=(await enqueue()).rows[0]; assert.equal(retry.id,first.id);assert.equal(retry.status,'failed');
});
test('repair appends a new attempt, preserves failed snapshot, and reuses the active attempt',async()=>{
 await db.exec(await readMigration('20261014021100_assembly_retry_attempts.sql'));
 const first=(await enqueue()).rows[0];await db.query("update generation_jobs set status='failed' where id=$1",[first.id]);
 const retry=(await enqueue()).rows[0];assert.notEqual(retry.id,first.id);assert.equal(retry.status,'queued');
 assert.deepEqual(retry.input_snapshot,first.input_snapshot);
 assert.equal((await enqueue()).rows[0].id,retry.id);
 assert.equal((await db.query('select status from generation_jobs where id=$1',[first.id])).rows[0].status,'failed');
});
test('completed assembly is reused, and non-owner cannot enqueue',async()=>{
 await db.exec(await readMigration('20261014021100_assembly_retry_attempts.sql'));
 const first=(await enqueue()).rows[0];await db.query("update generation_jobs set status='completed' where id=$1",[first.id]);assert.equal((await enqueue()).rows[0].id,first.id);
 await db.exec(`set local request.jwt.claim.sub='${ids.other}'; set local role authenticated;`);
 await assert.rejects(enqueue(),/FORBIDDEN/);
});
test('creator variant appends and replays the same request without changing approvals',async()=>{
 await db.exec(await readMigration('20261014021200_creator_asset_choices.sql'));
 const q=`select id,status from enqueue_scene_image_variant('${ids.project}','${ids.scene}','11111111-1111-4111-8111-111111111111')`;
 const first=(await db.query(q)).rows[0];assert.equal(first.status,'queued');assert.equal((await db.query(q)).rows[0].id,first.id);
 await db.query("update generation_jobs set status='completed' where id=$1",[first.id]);assert.equal((await db.query(q)).rows[0].id,first.id);
 assert.equal((await db.query('select count(*)::int as n from scene_image_assets where approved')).rows[0].n,1);
});
test('new approval cannot silently supersede approved imagery',async()=>{
 await db.exec(await readMigration('20261014021200_creator_asset_choices.sql'));
 await db.query(`insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${ids.project}','${ids.plan}','${ids.scene}','${ids.lock}','scene_image','completed','image-new','{}')`);
 const row=(await db.query(`insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url) select project_id,visual_plan_id,visual_plan_scene_id,id,'fixture','fixture','https://fixture.test/new.jpg' from generation_jobs where idempotency_key='image-new' returning id`)).rows[0];
 await assert.rejects(db.query('select approve_scene_image_asset($1)',[row.id]),/ALREADY_APPROVED/);
});

test('rejection is owner-only and cannot revoke a prior approval',async()=>{
 await db.exec(await readMigration('20261014021200_creator_asset_choices.sql'));
 const image=(await db.query('select id from scene_image_assets where approved')).rows[0];
 await assert.rejects(db.query('select reject_scene_asset($1,$2)',['scene_image',image.id]),/NOT_REJECTABLE/);
});
test('timeline gate rejects a wrong frozen duration before approval',async()=>{
 await db.exec(await readMigration('20261014021300_validate_visual_plan_timeline.sql'));
 await db.exec(`alter table visual_plans disable trigger visual_plans_immutable; update visual_plans set status='draft',locked_at=null,duration_seconds=10 where id='${ids.plan}'; alter table visual_plans enable trigger visual_plans_immutable;`);
 await assert.rejects(db.query(`update visual_plans set status='approved',locked_at=now() where id='${ids.plan}'`),/SONG_DURATION_INVALID/);
});
test('timeline gate rejects gaps even when last end matches song duration',async()=>{
 await db.exec(await readMigration('20261014021300_validate_visual_plan_timeline.sql'));
 await db.exec(`alter table visual_plans disable trigger visual_plans_immutable; update visual_plans set status='draft',locked_at=null where id='${ids.plan}'; alter table visual_plans enable trigger visual_plans_immutable;
 alter table visual_plan_scenes disable trigger visual_plan_scenes_immutable; update visual_plan_scenes set status='draft',end_time=10 where id='${ids.scene}'; alter table visual_plan_scenes enable trigger visual_plan_scenes_immutable;
 insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title) values('${ids.plan}','${ids.project}','${ids.world}','${ids.style}','${ids.song}',2,12,30,'Gap');`);
 await assert.rejects(db.query(`update visual_plans set status='approved',locked_at=now() where id='${ids.plan}'`),/TIMELINE_INVALID/);
});
test('plan revision preserves approved source/scenes/assets and replays to same draft',async()=>{
 await db.exec(await readMigration('20261014021400_atomic_visual_plan_revisions.sql'));
 const q=`select id,status,parent_plan_id,revision_number from create_visual_plan_revision('${ids.plan}')`;
 const draft=(await db.query(q)).rows[0];assert.equal(draft.status,'draft');assert.equal(draft.revision_number,2);assert.equal(draft.parent_plan_id,ids.plan);assert.equal((await db.query(q)).rows[0].id,draft.id);
 assert.equal((await db.query('select status from visual_plans where id=$1',[ids.plan])).rows[0].status,'approved');
 const sourceScene=(await db.query('select * from visual_plan_scenes where id=$1',[ids.scene])).rows[0];assert.equal(sourceScene.status,'approved');
 const copied=(await db.query('select * from visual_plan_scenes where visual_plan_id=$1',[draft.id])).rows[0];assert.notEqual(copied.id,ids.scene);assert.equal(copied.status,'draft');assert.equal(Number(copied.end_time),30);
 assert.equal((await db.query('select count(*)::int as n from scene_image_assets where approved')).rows[0].n,1);
 await db.exec(`set local request.jwt.claim.sub='${ids.other}';set local role authenticated;`);
 await assert.rejects(db.query(q),/FORBIDDEN/);
});
test('analysis RPC rejects invalid measurements, and direct client writes cannot claim completion',async()=>{
 await db.exec(await readMigration('20261014021500_owner_checked_analysis_writes.sql'));
 await db.exec('set local role authenticated');
 await assert.rejects(db.query(`update songs set analysis_status='completed' where id='${ids.song}'`),/permission denied/);
});
test('analysis RPC binds DSP to audio revision and strips unverified transcription claims',async()=>{
 await db.exec(await readMigration('20261014021500_owner_checked_analysis_writes.sql'));
 await db.exec('set local role authenticated');
 await db.query('select save_local_song_analysis($1,$2,$3,$4,$5)',[ids.project,ids.song,'1','completed',{analysis_method:'browser_audio_decode',duration_seconds:30,sections:[{index:0,start_time:0,end_time:30}],transcript:'fabricated',transcription_status:'completed'}]);
 const row=(await db.query('select analysis from songs where id=$1',[ids.song])).rows[0];assert.equal(row.analysis.transcription_status,'unavailable');assert.equal(row.analysis.transcript,undefined);
 await assert.rejects(db.query('select save_local_song_analysis($1,$2,$3,$4,$5)',[ids.project,ids.song,'old','completed',{analysis_method:'browser_audio_decode',duration_seconds:30}]),/REVISION_CHANGED/);
});

test('missing auth subject cannot approve even through authenticated RPC privileges',async()=>{
 await db.exec(await readMigration('20261014021200_creator_asset_choices.sql'));
 await db.query(`insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${ids.project}','${ids.plan}','${ids.scene}','${ids.lock}','scene_image','completed','no-auth-image','{}')`);
 const row=(await db.query(`insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url) select project_id,visual_plan_id,visual_plan_scene_id,id,'fixture','fixture','https://fixture.test/new.jpg' from generation_jobs where idempotency_key='no-auth-image' returning id`)).rows[0];
 await db.exec("set local request.jwt.claim.sub='';set local role authenticated");
 await assert.rejects(db.query('select approve_scene_image_asset($1)',[row.id]),/ASSET_NOT_FOUND/);
});
test('final rows are server-only, while owner-scoped SELECT survives',async()=>{
 await db.exec(await readMigration('20261008160000_final_videos_baseline.sql'));
 await db.exec(await readMigration('20261014021000_lock_final_video_writes.sql'));
 await db.exec('set local role authenticated');
 await db.query('select id from final_videos');
 await assert.rejects(db.query('insert into final_videos(project_id) values($1)',[ids.project]),/permission denied/);
});
