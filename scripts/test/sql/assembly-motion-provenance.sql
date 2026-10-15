-- Isolated PostgreSQL regression only: never execute fixture mutations in production.
insert into public.generation_jobs(id,project_id,visual_plan_id,visual_plan_scene_id,job_type,status,output)
values('00000000-0000-0000-0000-000000000950','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000300','scene_motion','completed','{}');
update public.motion_clip_assets set generation_job_id='00000000-0000-0000-0000-000000000950';

reset role;
delete from public.generation_jobs where job_type='assembly';
update public.motion_clip_assets set model='image-motion';
update public.generation_jobs set output='{}'::jsonb where job_type='scene_motion';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'PROCEDURAL_MOTION' then raise exception 'ASSEMBLY_PROVENANCE_EXPECTED_PROCEDURAL_MOTION'; end if;
  b:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.id<>b.id or a.input_snapshot<>b.input_snapshot then raise exception 'ASSEMBLY_SNAPSHOT_REPLACED'; end if;
end $test$;

reset role;
delete from public.generation_jobs where job_type='assembly';
update public.motion_clip_assets set model='other';
update public.generation_jobs set output='{"arena_response":{"result":{"generation_type":"PROCEDURAL_MOTION"}}}'::jsonb where job_type='scene_motion';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'PROCEDURAL_MOTION' then raise exception 'ASSEMBLY_PROVENANCE_EXPECTED_PROCEDURAL_MOTION'; end if;
  b:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.id<>b.id or a.input_snapshot<>b.input_snapshot then raise exception 'ASSEMBLY_SNAPSHOT_REPLACED'; end if;
end $test$;

reset role;
delete from public.generation_jobs where job_type='assembly';
update public.motion_clip_assets set model='other';
update public.generation_jobs set output='{"arena_status_response":{"result":{"generation_type":"GENERATIVE_VIDEO"}}}'::jsonb where job_type='scene_motion';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'GENERATIVE_VIDEO' then raise exception 'ASSEMBLY_PROVENANCE_EXPECTED_GENERATIVE_VIDEO'; end if;
  b:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.id<>b.id or a.input_snapshot<>b.input_snapshot then raise exception 'ASSEMBLY_SNAPSHOT_REPLACED'; end if;
end $test$;

reset role;
delete from public.generation_jobs where job_type='assembly';
update public.motion_clip_assets set model='other';
update public.generation_jobs set output='{}'::jsonb where job_type='scene_motion';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'UNKNOWN' then raise exception 'ASSEMBLY_PROVENANCE_EXPECTED_UNKNOWN'; end if;
  b:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.id<>b.id or a.input_snapshot<>b.input_snapshot then raise exception 'ASSEMBLY_SNAPSHOT_REPLACED'; end if;
end $test$;

reset role;
delete from public.generation_jobs where job_type='assembly';
update public.motion_clip_assets set model='image-motion';
update public.generation_jobs set output='{"result":{"generation_type":"GENERATIVE_VIDEO"}}'::jsonb where job_type='scene_motion';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; b public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'PROCEDURAL_MOTION' then raise exception 'ASSEMBLY_PROVENANCE_EXPECTED_PROCEDURAL_MOTION'; end if;
  b:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.id<>b.id or a.input_snapshot<>b.input_snapshot then raise exception 'ASSEMBLY_SNAPSHOT_REPLACED'; end if;
end $test$;
reset role;
delete from public.generation_jobs where job_type='assembly';
update public.motion_clip_assets set model='other', generation_job_id=null;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $test$ declare a public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'UNKNOWN' then raise exception 'MISSING_PROVENANCE_FABRICATED'; end if;
end $test$;
reset role;
-- The same assembly is returned even if mutable provider metadata later changes.
update public.motion_clip_assets set model='image-motion';
set role authenticated;
do $test$ declare a public.generation_jobs; begin
  a:=public.enqueue_assembly_generation('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200');
  if a.input_snapshot->'motion_clips'->0->>'generation_type' is distinct from 'UNKNOWN' then raise exception 'EXISTING_SNAPSHOT_REWRITTEN'; end if;
end $test$;
reset role;
select 'ASSEMBLY_MOTION_PROVENANCE_PASS' as result;
