import test from 'node:test';
import assert from 'node:assert/strict';
import { database, readMigration } from './pglite-runtime.mjs';

test('atomic plan builder retains structured World directions and time-aligned transcript',async()=>{
 const db=await database();
 try {
  await db.exec(await readMigration('20261014021400_atomic_visual_plan_revisions.sql'));
  const ids={p:'10000000-0000-4000-8000-000000000001',o:'10000000-0000-4000-8000-000000000002',w:'10000000-0000-4000-8000-000000000003',s:'10000000-0000-4000-8000-000000000004',a:'10000000-0000-4000-8000-000000000005',l:'10000000-0000-4000-8000-000000000006'};
  await db.exec(`set request.jwt.claim.sub='${ids.o}'; insert into projects values('${ids.p}','${ids.o}','${ids.w}');
   insert into world_reports(id,project_id,status,confirmed_at,environments,emotional_arc,mood,visual_language) values('${ids.w}','${ids.p}','completed',now(),'[{"setting":"dimly lit interior"},{"setting":"abstract mindscape"}]','[{"description":"raw admission of loss"}]','["melancholic"]','"Blue corridor"');
   insert into style_bibles(id,project_id,world_report_id,status,approved_at,cinematography,continuity_rules) values('${ids.s}','${ids.p}','${ids.w}','approved',now(),'{"movements":["slow pan"],"camera_types":["handheld"],"focus":"rack focus"}','[{"rule":"Preserve deep blue palette"}]');
   insert into songs(id,project_id,analysis_status,analysis) values('${ids.a}','${ids.p}','completed','{"duration_seconds":30,"sections":[{"index":0,"start_time":0,"end_time":15},{"index":1,"start_time":15,"end_time":30}],"transcript_segments":[{"start":0,"end":10,"text":"First lyric"},{"start":18,"end":22,"text":"Second lyric"}]}');
   insert into vision_locks(id,project_id,snapshot) values('${ids.l}','${ids.p}','{"song":{"analysis":{"duration_seconds":30}}}');
   create function public.create_vision_lock(p_project_id uuid) returns vision_locks language sql as $$select * from vision_locks where project_id=p_project_id limit 1$$;
  `);
  const plan=(await db.query('select * from create_visual_plan($1)',[ids.p])).rows[0];
  const scenes=(await db.query('select * from visual_plan_scenes where visual_plan_id=$1 order by scene_number',[plan.id])).rows;
  assert.match(scenes[0].location,/dimly lit interior/);assert.match(scenes[0].location,/abstract mindscape/);
  assert.match(scenes[0].camera_direction,/slow pan/);assert.match(scenes[0].camera_direction,/handheld/);assert.match(scenes[0].camera_direction,/rack focus/);
  assert.match(scenes[0].continuity_notes,/deep blue palette/);assert.match(plan.creative_thesis,/raw admission of loss/);
  assert.equal(plan.vision_lock_id,ids.l);assert.equal(scenes[0].lyric_moment,'First lyric');assert.equal(scenes[1].lyric_moment,'Second lyric');assert.notEqual(scenes[0].visual_direction,scenes[1].visual_direction);
  assert.equal((await db.query('select id from create_visual_plan($1)',[ids.p])).rows[0].id,plan.id);
  // Failed multi-row creation rolls back its plan, scenes and lock transaction together.
  await db.exec(`delete from visual_plan_scenes;delete from visual_plans;update songs set analysis=jsonb_set(analysis,'{sections}','[{"index":0,"start_time":0,"end_time":15},{"index":1,"start_time":20,"end_time":10}]');`);
  await assert.rejects(db.query('select * from create_visual_plan($1)',[ids.p]),/SECTION_INVALID/);
  assert.equal((await db.query('select count(*)::int n from visual_plans')).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from visual_plan_scenes')).rows[0].n,0);
 } finally {await db.close();}
});
