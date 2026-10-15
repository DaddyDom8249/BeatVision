import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export async function readMigration(name) { return (await readFile(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')).replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,''); }
export async function database() {
 const db = new PGlite();
 await db.exec(`create role authenticated; create role anon; create role service_role bypassrls;
 create schema auth; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
 create table projects(id uuid primary key default gen_random_uuid(),owner_id uuid,world_report_id uuid);
 create table world_reports(id uuid primary key default gen_random_uuid(),project_id uuid,status text,confirmed_at timestamptz,mood jsonb,emotional_arc jsonb,visual_language jsonb,environments jsonb,cinematography jsonb,color_lighting jsonb,atmosphere jsonb,movement jsonb,continuity_rules jsonb);
 create table style_bibles(id uuid primary key default gen_random_uuid(),project_id uuid,world_report_id uuid,status text,approved_at timestamptz,visual_language jsonb,cinematography jsonb,color_lighting jsonb,atmosphere jsonb,movement jsonb,continuity_rules jsonb);
 create table songs(id uuid primary key default gen_random_uuid(),project_id uuid,analysis_status text,analysis jsonb,audio_path text,audio_revision int default 1,analyzed_at timestamptz,title text,artist text,lyrics text,creative_direction text,notes text,updated_at timestamptz default now());
 grant all on projects,world_reports,style_bibles,songs to authenticated,service_role;`);
 await db.exec(await readMigration('20261003120000_phase4_visual_plan.sql'));
 await db.exec(`alter table visual_plans add column vision_lock_id uuid; create table vision_locks(id uuid primary key default gen_random_uuid(),project_id uuid,world_report_id uuid,style_bible_id uuid,song_id uuid,revision_number int,status text,snapshot jsonb);
 create table generation_jobs(id uuid primary key default gen_random_uuid(),project_id uuid,vision_lock_id uuid,visual_plan_id uuid,visual_plan_scene_id uuid,job_type text,idempotency_key text unique,input_snapshot jsonb,status text default 'queued',output jsonb default '{}',error jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
 grant select on generation_jobs,vision_locks to authenticated; grant all on generation_jobs,vision_locks to service_role;`);
 await db.exec(await readMigration('20261006042805_canonical_scene_image_assets.sql'));
 await db.exec(await readMigration('20261006042813_canonical_motion_clip_assets.sql'));
 await db.exec(await readMigration('20261006231126_secure_asset_approval.sql'));
 await db.exec(await readMigration('20261010053000_owner_checked_generation_enqueue.sql'));
 await db.exec(await readMigration('20261010070000_assembly_motion_provenance.sql'));
 return db;
}
