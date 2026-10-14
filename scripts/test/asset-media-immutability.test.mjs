// Hardening 2026-10-14: approved/generated assets cannot be silently replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import { database, readMigration } from './pglite-runtime.mjs';
const P='00000000-0000-4000-8000-0000000000a1', W='00000000-0000-4000-8000-0000000000a2', S='00000000-0000-4000-8000-0000000000a3', G='00000000-0000-4000-8000-0000000000a4', V='00000000-0000-4000-8000-0000000000a5', SC='00000000-0000-4000-8000-0000000000a6', L='00000000-0000-4000-8000-0000000000a7';
let db;
test.before(async()=>{
 db=await database();
 await db.exec(`insert into projects values('${P}','00000000-0000-4000-8000-000000000001','${W}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${W}','${P}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${S}','${P}','${W}','approved',now());
 insert into songs(id,project_id,analysis_status,analysis,audio_path) values('${G}','${P}','completed','{"duration_seconds":30}','o/p/s.mp3');
 insert into vision_locks values('${L}','${P}','${W}','${S}','${G}',1,'locked','{}');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,locked_at,duration_seconds) values('${V}','${P}','${W}','${S}','${G}','${L}','approved',now(),30);
 insert into visual_plan_scenes(id,visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,status) values('${SC}','${V}','${P}','${W}','${S}','${G}',1,0,30,'Scene','approved');
 insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${P}','${V}','${SC}','${L}','scene_image','completed','img','{}');
 insert into scene_image_assets(project_id,visual_plan_id,scene_id,generation_job_id,provider,model,image_url,status,approved) select project_id,visual_plan_id,visual_plan_scene_id,id,'f','f','https://fixture.test/a.jpg','approved',true from generation_jobs where idempotency_key='img';
 insert into generation_jobs(project_id,visual_plan_id,visual_plan_scene_id,vision_lock_id,job_type,status,idempotency_key,input_snapshot) values('${P}','${V}','${SC}','${L}','scene_motion','completed','mot','{}');
 insert into motion_clip_assets(project_id,visual_plan_id,scene_id,generation_job_id,scene_image_id,provider,model,video_url,status,approved) select j.project_id,j.visual_plan_id,j.visual_plan_scene_id,j.id,i.id,'f','f','https://fixture.test/m.mp4','approved',true from generation_jobs j, scene_image_assets i where j.idempotency_key='mot';`);
});
test.after(async()=>db?.close());
test.beforeEach(()=>db.exec('begin'));
test.afterEach(()=>db.exec('rollback'));
test('baseline (before migration): service role can silently swap approved media',async()=>{
 await db.query("update scene_image_assets set image_url='https://evil.test/x.jpg'");
 assert.equal((await db.query('select image_url from scene_image_assets')).rows[0].image_url,'https://evil.test/x.jpg');
});
test('migration blocks media rewrite and approved delete, allows status transitions',async()=>{
 await db.exec(await readMigration('20261014180000_approved_asset_media_immutability.sql'));
 await db.exec('savepoint a');
 await assert.rejects(db.query("update scene_image_assets set image_url='https://evil.test/x.jpg'"),/GENERATED_ASSET_MEDIA_IMMUTABLE/);
 await db.exec('rollback to savepoint a');
 await assert.rejects(db.query("update motion_clip_assets set video_url='https://evil.test/x.mp4'"),/GENERATED_ASSET_MEDIA_IMMUTABLE/);
 await db.exec('rollback to savepoint a');
 await assert.rejects(db.query('delete from motion_clip_assets'),/APPROVED_ASSET_DELETE_FORBIDDEN/);
 await db.exec('rollback to savepoint a');
 await db.query("update motion_clip_assets set status='generated',approved=false");
 assert.equal((await db.query('select approved from motion_clip_assets')).rows[0].approved,false);
});
