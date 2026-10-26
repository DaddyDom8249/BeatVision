import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {database} from './pglite-runtime.mjs';
const owner='21000000-0000-4000-8000-000000000001',project='21000000-0000-4000-8000-000000000002',plan='21000000-0000-4000-8000-000000000003';
const world='21000000-0000-4000-8000-000000000004',style='21000000-0000-4000-8000-000000000005',song='21000000-0000-4000-8000-000000000006';
let db,ids;
test.before(async()=>{
 db=await database(); await db.exec(await readFile(process.env.GUIDED_REPAIR_MIGRATION || new URL('../../supabase/migrations/20261026040549_guided_shot_direction_repairs.sql',import.meta.url),'utf8'));
 await db.exec(`insert into projects(id,owner_id,world_report_id) values('${project}','${owner}','${world}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${world}','${project}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${style}','${project}','${world}','approved',now());
 insert into songs(id,project_id,analysis_status) values('${song}','${project}','completed');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,title) values('${plan}','${project}','${world}','${style}','${song}','Saved story');`);
 ids=[];for(let i=0;i<55;i++){
  const row=await db.query(`insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,movement_direction,camera_direction,location,continuity_notes) values($1,$2,'${world}','${style}','${song}',$3,$4,$5,'Saved shot','subtle gestures','slow','Approved location','Keep wardrobe') returning id`,[plan,project,i+1,i*5,(i+1)*5]); ids.push(row.rows[0].id);
 }
});
test.after(()=>db?.close());
test.beforeEach(async()=>{await db.exec(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;`);});
test.afterEach(()=>db.exec('rollback'));
const repair=id=>({scene_id:id,expected_movement_direction:'subtle gestures',expected_camera_direction:'slow',actor:'The existing subject breathes gently while keeping the same pose.',camera:'Keep the camera fixed. No zoom.'});
const save=items=>db.query('select public.save_guided_shot_directions($1,$2) n',[plan,JSON.stringify(items)]);
test('all55drafts save atomically without changing story, timing, continuity or approval',async()=>{
 assert.equal((await save(ids.map(repair))).rows[0].n,55);
 const row=(await db.query('select movement_direction,location,continuity_notes,status,start_time,end_time from visual_plan_scenes order by scene_number limit 1')).rows[0];
 assert.equal(JSON.parse(row.movement_direction).actor,repair(ids[0]).actor);assert.equal(row.location,'Approved location');assert.equal(row.continuity_notes,'Keep wardrobe');assert.equal(row.status,'draft');assert.equal(Number(row.end_time),5);
 assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,0);
});
test('late stale direction rolls back every earlier shot update',async()=>{
 await db.exec('savepoint attempt');await assert.rejects(save([repair(ids[0]),{...repair(ids[54]),expected_movement_direction:'stale'}]),/GUIDED_REPAIR_STALE/);await db.exec('rollback to attempt');
 assert.equal((await db.query('select count(*)::int n from visual_plan_scenes where movement_direction=\'subtle gestures\'')).rows[0].n,55);
});
test('another owner is rejected without revealing or modifying shots',async()=>{
 await db.exec("set local request.jwt.claim.sub='21000000-0000-4000-8000-000000000099'");await assert.rejects(save([repair(ids[0])]),/GUIDED_REPAIR_FORBIDDEN/);
});
test('anonymous execution is denied',async()=>{
 assert.equal((await db.query("select has_function_privilege('anon','public.save_guided_shot_directions(uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
});
test('approved plan refuses draft assistance',async()=>{
 await db.exec('reset role');await db.exec(`update visual_plans set status='approved',locked_at=now() where id='${plan}'`);await db.exec('set local role authenticated');await assert.rejects(save([repair(ids[0])]),/GUIDED_REPAIR_DRAFT_REQUIRED/);
});
test('duplicate, oversized and invalid payloads reject without updates',async()=>{
 for(const items of [[],Array.from({length:501},()=>repair(ids[0])),[repair(ids[0]),repair(ids[0])],[{...repair(ids[0]),actor:''}]]){
  await db.exec('savepoint invalid');await assert.rejects(save(items),/GUIDED_REPAIR_INVALID/);await db.exec('rollback to invalid');
 }
});

test('a locked scene within a draft plan cannot be overwritten',async()=>{
 await db.exec('reset role');await db.query("update visual_plan_scenes set status='approved' where id=$1",[ids[0]]);await db.exec('set local role authenticated');
 await assert.rejects(save([repair(ids[0])]),/GUIDED_REPAIR_DRAFT_REQUIRED/);
});
test('unknown scene cannot be substituted into the reviewed draft',async()=>{
 await assert.rejects(save([repair('21000000-0000-4000-8000-000000000099')]),/GUIDED_REPAIR_DRAFT_REQUIRED/);
});
