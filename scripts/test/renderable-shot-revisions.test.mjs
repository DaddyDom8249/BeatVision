import test from 'node:test';
import assert from 'node:assert/strict';
import {database,readMigration} from './pglite-runtime.mjs';
import {modalFramesForScene} from '../../supabase/functions/beatvision-generation/modal-motion.ts';
const ids={p:'11000000-0000-4000-8000-000000000001',o:'11000000-0000-4000-8000-000000000002',w:'11000000-0000-4000-8000-000000000003',s:'11000000-0000-4000-8000-000000000004',a:'11000000-0000-4000-8000-000000000005',l:'11000000-0000-4000-8000-000000000006',plan:'11000000-0000-4000-8000-000000000007'};
let db;
test.before(async()=>{
 db=await database();
 await db.exec(await readMigration('20261014021400_atomic_visual_plan_revisions.sql'));
 await db.exec(await readMigration('20261025170119_renderable_shot_revisions.sql'));
 const binding=await readMigration('20261004090249_visual_plan_vision_lock_binding.sql');
 const start=binding.indexOf('create or replace function public.approve_visual_plan(');
 await db.exec(binding.slice(start,binding.indexOf('$$;',start)+3));
 await db.exec(`insert into projects values('${ids.p}','${ids.o}','${ids.w}');
 insert into world_reports(id,project_id,status,confirmed_at) values('${ids.w}','${ids.p}','completed',now());
 insert into style_bibles(id,project_id,world_report_id,status,approved_at) values('${ids.s}','${ids.p}','${ids.w}','approved',now());
 insert into songs(id,project_id,analysis_status,analysis) values('${ids.a}','${ids.p}','completed','{"duration_seconds":240}');
 insert into vision_locks values('${ids.l}','${ids.p}','${ids.w}','${ids.s}','${ids.a}',1,'locked','{"song":{"analysis":{"duration_seconds":240}}}');
 insert into visual_plans(id,project_id,world_report_id,style_bible_id,song_id,vision_lock_id,status,locked_at,duration_seconds) values('${ids.plan}','${ids.p}','${ids.w}','${ids.s}','${ids.a}','${ids.l}','approved',now(),240);
 insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,start_time,end_time,title,movement_direction,continuity_notes,status)
 values('${ids.plan}','${ids.p}','${ids.w}','${ids.s}','${ids.a}',1,0,117.3,'First section','Hold the subject still.','Keep the same clothing.','approved'),
 ('${ids.plan}','${ids.p}','${ids.w}','${ids.s}','${ids.a}',2,117.3,240,'Second section','Slow head turn.','Preserve the doorway.','approved');`);
});
test.after(async()=>db?.close());
test.beforeEach(async()=>db.exec(`begin;set local request.jwt.claim.sub='${ids.o}';`));
test.afterEach(async()=>db.exec('rollback'));
const split=(cap=5)=>db.query('select * from create_renderable_shot_revision($1,$2)',[ids.plan,cap]);

test('four-minute revision has contiguous renderable shots, frozen lineage and unchanged source',async()=>{
 const before=(await db.query('select * from visual_plan_scenes where visual_plan_id=$1 order by scene_number',[ids.plan])).rows;
 const plan=(await split()).rows[0];
 assert.equal(plan.status,'draft');assert.equal(plan.parent_plan_id,ids.plan);assert.equal(plan.vision_lock_id,ids.l);
 const shots=(await db.query('select * from visual_plan_scenes where visual_plan_id=$1 order by scene_number',[plan.id])).rows;
 assert.equal(shots.length,49);assert.equal(Number(shots[0].start_time),0);assert.equal(Number(shots.at(-1).end_time),240);
 for(let i=0;i<shots.length;i++){
  const s=shots[i];const start=Number(s.start_time),end=Number(s.end_time);
  assert.equal(s.status,'draft');assert.equal(s.scene_number,i+1);assert.ok(end>start && end-start<=5+1e-10);
  if(i)assert.equal(start,Number(shots[i-1].end_time));
  assert.ok(modalFramesForScene({start_time:start,end_time:end},k=>k==='BRAGORA_MODAL_MAX_FRAMES'?'121':'')/24>=end-start);
  const parent=before[start<117.3?0:1];assert.equal(s.movement_direction,parent.movement_direction);assert.equal(s.continuity_notes,parent.continuity_notes);
 }
 assert.deepEqual((await db.query('select * from visual_plan_scenes where visual_plan_id=$1 order by scene_number',[ids.plan])).rows,before);
 assert.equal((await split()).rows[0].id,plan.id);
 assert.equal((await db.query('select count(*)::int n from generation_jobs')).rows[0].n,0);
 await db.exec(await readMigration('20261014021300_validate_visual_plan_timeline.sql'));
 await db.query('select approve_visual_plan($1)',[plan.id]);
});

test('owner-only RPC is idempotent and refuses a changed split request',async()=>{
 const first=(await split()).rows[0];assert.equal((await split()).rows[0].id,first.id);
 await assert.rejects(split(4),/REVISION_ALREADY_EXISTS/);
});

test('other owners and anonymous callers cannot create revisions',async()=>{
 await db.exec(`set local request.jwt.claim.sub='11000000-0000-4000-8000-000000000099';set local role authenticated;`);
 await assert.rejects(split(),/FORBIDDEN/);
});

test('anonymous execute and direct scene insert remain denied',async()=>{
 assert.equal((await db.query("select has_function_privilege('anon','public.create_renderable_shot_revision(uuid,numeric)','EXECUTE') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_table_privilege('authenticated','public.visual_plan_scenes','INSERT') allowed")).rows[0].allowed,false);
});

test('oversized or invalid cap fails without inserting a partial revision',async()=>{
 for(const cap of [0,1,5.1,null]){
  await db.exec('savepoint invalid_cap');await assert.rejects(split(cap),/SHOT_DURATION_INVALID/);await db.exec('rollback to invalid_cap');
 }
 assert.equal((await db.query('select count(*)::int n from visual_plans')).rows[0].n,1);
});

test('a draft song longer than four minutes keeps its exact endpoint and saved edits',async()=>{
 await db.exec('alter table visual_plans disable trigger visual_plans_immutable;alter table visual_plan_scenes disable trigger visual_plan_scenes_immutable;');
 await db.query("update visual_plans set status='draft',locked_at=null,duration_seconds=264.95997916666664 where id=$1",[ids.plan]);
 await db.query("update visual_plan_scenes set status='draft',end_time=264.95997916666664,movement_direction='Creator saved action.' where visual_plan_id=$1 and scene_number=2",[ids.plan]);
 const plan=(await split()).rows[0];
 assert.equal(Number(plan.duration_seconds),264.95997916666664);
 const shots=(await db.query('select * from visual_plan_scenes where visual_plan_id=$1 order by scene_number',[plan.id])).rows;
 assert.equal(Number(shots.at(-1).end_time),264.95997916666664);assert.equal(shots.at(-1).movement_direction,'Creator saved action.');
 assert.ok(shots.every(s=>Number(s.end_time)-Number(s.start_time)<=5+1e-10));
});

test('gaps and overlapping source scenes reject atomically instead of claiming full coverage',async()=>{
 await db.exec('alter table visual_plan_scenes disable trigger visual_plan_scenes_immutable;');
 await db.query('update visual_plan_scenes set start_time=118 where visual_plan_id=$1 and scene_number=2',[ids.plan]);
 await assert.rejects(split(),/TIMELINE_INVALID/);
 await db.exec('rollback;begin;');
 assert.equal((await db.query('select count(*)::int n from visual_plans')).rows[0].n,1);
});

test('more than 500 shots fail before any plan is inserted',async()=>{
 await db.exec('alter table visual_plans disable trigger visual_plans_immutable;alter table visual_plan_scenes disable trigger visual_plan_scenes_immutable;');
 await db.query('update visual_plans set duration_seconds=3000 where id=$1',[ids.plan]);
 await db.query('update visual_plan_scenes set end_time=3000 where visual_plan_id=$1 and scene_number=2',[ids.plan]);
 await assert.rejects(split(),/TOO_MANY_SCENES/);
 await db.exec('rollback;begin;');
 assert.equal((await db.query('select count(*)::int n from visual_plans')).rows[0].n,1);
});
