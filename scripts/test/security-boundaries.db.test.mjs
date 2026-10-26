import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(process.env.SECURITY_BOUNDARY_MIGRATION||new URL('../../supabase/migrations/20261026180038_secure_legacy_media_and_rate_limits.sql',import.meta.url),'utf8');
const owner='81000000-0000-4000-8000-000000000001',other='81000000-0000-4000-8000-000000000002';let db;
test.before(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,public boolean);create table storage.objects(id int primary key,bucket_id text,owner_id text,payload text);
 alter table storage.objects enable row level security;grant select on storage.objects to anon,authenticated;grant all on storage.objects to service_role;
 create policy "BeatVision public read scene images" on storage.objects for select to public using(bucket_id='scene-images');
 create policy "BeatVision authenticated read non-song storage" on storage.objects for select to authenticated using(bucket_id in ('scene-images','render-manifests'));
 create table beatvision_arena_rate_limits(user_id uuid,window_start timestamptz,request_count int,primary key(user_id,window_start));
 alter table beatvision_arena_rate_limits enable row level security;grant all on beatvision_arena_rate_limits to authenticated;
 create policy arena_rate_limits_select_own on beatvision_arena_rate_limits for select to authenticated using(user_id=auth.uid());
 create policy arena_rate_limits_insert_own on beatvision_arena_rate_limits for insert to authenticated with check(user_id=auth.uid());
 create policy arena_rate_limits_update_own on beatvision_arena_rate_limits for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create policy arena_rate_limits_delete_own on beatvision_arena_rate_limits for delete to authenticated using(user_id=auth.uid());
 create function enqueue_scene_image_variant(uuid,uuid,uuid) returns boolean language sql security definer as $$select true$$;
 insert into storage.buckets values('scene-images',true),('render-manifests',true),('visual-assets',false);
 insert into storage.objects values(1,'scene-images','${owner}','same-image-bytes'),(2,'render-manifests','${owner}','same-manifest-bytes'),(3,'scene-images','${other}','other-image-bytes');
 `);await db.exec(sql);
});
test.after(()=>db?.close());test.beforeEach(()=>db.exec(`begin;set local request.jwt.claim.sub='${owner}';`));test.afterEach(()=>db.exec('rollback'));
test('legacy buckets become private without changing objects, ownership or canonical bucket',async()=>{
 assert.ok((await db.query('select * from storage.buckets')).rows.every(x=>!x.public));
 assert.deepEqual((await db.query('select id,owner_id,payload from storage.objects order by id')).rows,[{id:1,owner_id:owner,payload:'same-image-bytes'},{id:2,owner_id:owner,payload:'same-manifest-bytes'},{id:3,owner_id:other,payload:'other-image-bytes'}]);
});
test('anonymous and another owner cannot read legacy images or manifests',async()=>{
 await db.exec('set local role anon;');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,0);
 await db.exec(`set local role authenticated;set local request.jwt.claim.sub='${other}';`);
 assert.deepEqual((await db.query('select id from storage.objects order by id')).rows,[{id:3}]);
});
test('owner reads both existing file types and trusted storage service retains access',async()=>{
 await db.exec('set local role authenticated;');assert.deepEqual((await db.query('select id from storage.objects order by id')).rows,[{id:1},{id:2}]);
 await db.exec('set local role service_role;');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,3);
});
test('counter admits exactly30 requests and cannot be reset, deleted, forged or truncated by caller',async()=>{
 await db.exec('set local role authenticated;');
 for(let i=1;i<=31;i++)assert.equal((await db.query('select consume_beatvision_arena_rate_limit() ok')).rows[0].ok,i<=30);
 for(const q of ['update beatvision_arena_rate_limits set request_count=0','delete from beatvision_arena_rate_limits',`insert into beatvision_arena_rate_limits values('${owner}',now(),0)`,'truncate beatvision_arena_rate_limits']){
  await db.exec('savepoint attack');await assert.rejects(db.query(q),/permission denied/);await db.exec('rollback to savepoint attack');
 }
 assert.equal((await db.query('select request_count from beatvision_arena_rate_limits')).rows[0].request_count,31);
});
test('counter binds only to auth.uid, isolates users and refuses missing identity',async()=>{
 await db.exec('set local role authenticated;');await db.query('select consume_beatvision_arena_rate_limit()');
 await db.exec(`set local request.jwt.claim.sub='${other}';`);assert.equal((await db.query('select consume_beatvision_arena_rate_limit() ok')).rows[0].ok,true);
 assert.equal((await db.query('select count(*)::int n from beatvision_arena_rate_limits')).rows[0].n,1);
 await db.exec("set local request.jwt.claim.sub='';");assert.equal((await db.query('select consume_beatvision_arena_rate_limit() ok')).rows[0].ok,false);
});
test('anonymous RPC execution denied while authenticated generation variant and counter stay callable',async()=>{
 const rows=(await db.query("select proname,has_function_privilege('anon',oid,'execute') anon,has_function_privilege('authenticated',oid,'execute') authenticated from pg_proc where proname in ('consume_beatvision_arena_rate_limit','enqueue_scene_image_variant')")).rows;
 assert.equal(rows.length,2);assert.ok(rows.every(x=>!x.anon&&x.authenticated));
});
