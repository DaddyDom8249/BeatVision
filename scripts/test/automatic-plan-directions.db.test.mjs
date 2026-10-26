import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {database} from './pglite-runtime.mjs';
const owner='31000000-0000-4000-8000-000000000001',project='31000000-0000-4000-8000-000000000002',plan='31000000-0000-4000-8000-000000000003';
const world='31000000-0000-4000-8000-000000000004',style='31000000-0000-4000-8000-000000000005',song='31000000-0000-4000-8000-000000000006',interpretation='31000000-0000-4000-8000-000000000007';
let db,ids=[];
test.before(async()=>{
 db=await database();await db.exec('alter table songs add column current_interpretation_id uuid,add column interpretation_confirmed_at timestamptz');
 const dir=new URL('../../supabase/migrations/',import.meta.url),name=(await readdir(dir)).find(n=>n.endsWith('_automatic_scene_directions.sql'));assert.ok(name);
 await db.exec(await readFile(new URL(name,dir),'utf8'));
 await db.exec(`insert into projects(id,owner_id,world_report_id) values('${project}','${owner}','${world}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${world}','${project}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${style}','${project}','${world}','approved',now());
 insert into songs(id,project_id,analysis_status,current_interpretation_id,interpretation_confirmed_at) values('${song}','${project}','completed','${interpretation}',now());
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,title) values('${plan}','${project}','${world}','${style}','${song}','Saved story');`);
 for(let i=0;i<50;i++){
 const row=await db.query(`insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,visual_direction,movement_direction,camera_direction,location,continuity_notes,updated_at) values($1,$2,'${world}','${style}','${song}',$3,$4,$5,'Saved shot','Old visual','subtle gestures','slow','Approved location','Keep wardrobe','2026-10-26T00:00:00Z') returning id`,[plan,project,i+1,i*5,(i+1)*5]);ids.push(row.rows[0].id);
 }
});
test.after(()=>db?.close());
test.beforeEach(()=>db.exec(`begin;set local request.jwt.claim.sub='${owner}';set local role authenticated;`));
test.afterEach(()=>db.exec('rollback'));
const repair=(id,i=0)=>({scene_id:id,expected_updated_at:'2026-10-26T00:00:00Z',actor:`The figure reaches for the phone at moment ${i}. Feeling: dread.`,camera_direction:'Camera holds still.',visual_direction:`A visible phone beside the approved figure at moment ${i}.`,mood:'dread',lyric_moment:`Lyric ${i}`});
const save=(items,version=interpretation)=>db.query('select public.save_automatic_scene_directions($1,$2,$3) n',[plan,version,JSON.stringify(items)]);
test('all50scene directions save atomically with distinct action/visual/lyric context and no approvals or jobs',async()=>{
 const items=ids.map(repair);assert.equal((await save(items)).rows[0].n,50);
 const rows=(await db.query('select visual_direction,movement_direction,mood,lyric_moment,location,continuity_notes,status,start_time,end_time from visual_plan_scenes order by scene_number')).rows;
 assert.equal(new Set(rows.map(r=>r.visual_direction)).size,50);assert.equal(JSON.parse(rows[0].movement_direction).actor,items[0].actor);
 assert.equal(rows[0].mood,'dread');assert.equal(rows[0].location,'Approved location');assert.equal(rows[0].continuity_notes,'Keep wardrobe');assert.ok(rows.every(r=>r.status==='draft'));
 assert.equal(Number(rows[0].start_time),0);assert.equal(Number(rows.at(-1).end_time),250);assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,0);
});
test('one stale scene rolls back the entire50scene save',async()=>{
 const items=ids.map(repair);items.at(-1).expected_updated_at='1900-01-01T00:00:00Z';await db.exec('savepoint attempt');await assert.rejects(save(items),/AUTO_PLAN_STALE/);await db.exec('rollback to attempt');
 assert.equal((await db.query("select count(*)::int n from visual_plan_scenes where visual_direction='Old visual'")).rows[0].n,50);
});
test('foreign owner and anonymous calls cannot save a plan',async()=>{
 assert.equal((await db.query("select has_function_privilege('anon','public.save_automatic_scene_directions(uuid,uuid,jsonb)','execute') ok")).rows[0].ok,false);
 await db.exec("set local request.jwt.claim.sub='31000000-0000-4000-8000-000000000099'");await assert.rejects(save(ids.map(repair)),/AUTO_PLAN_FORBIDDEN/);
});
test('locked plan and changed interpretation are protected',async()=>{
 await db.exec('savepoint stale');await assert.rejects(save(ids.map(repair),'31000000-0000-4000-8000-000000000099'),/INTERPRETATION_STALE/);await db.exec('rollback to stale');
 await db.exec('reset role');await db.exec(`update visual_plans set status='approved',locked_at=now() where id='${plan}'`);await db.exec('set local role authenticated');await assert.rejects(save(ids.map(repair)),/DRAFT_REQUIRED/);
});
test('partial, duplicated and malformed full-plan payloads reject without a partial save',async()=>{
 for(const items of [ids.slice(0,49).map(repair),ids.map(()=>repair(ids[0])),ids.map((id,i)=>({...repair(id,i),...(i===49?{actor:''}:{})}))]){
 await db.exec('savepoint bad');await assert.rejects(save(items),/AUTO_PLAN_(INCOMPLETE|INVALID)/);await db.exec('rollback to bad');
 }
 assert.equal((await db.query("select count(*)::int n from visual_plan_scenes where visual_direction='Old visual'")).rows[0].n,50);
});
