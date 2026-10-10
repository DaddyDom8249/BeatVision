create role authenticated;
create role anon;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;

create table public.projects(id uuid primary key, owner_id uuid not null);
create table public.vision_locks(id uuid primary key,project_id uuid,world_report_id uuid,style_bible_id uuid,song_id uuid,revision_number integer,snapshot jsonb);
create table public.visual_plans(id uuid primary key,project_id uuid,vision_lock_id uuid,status text,title text,duration_seconds numeric,creative_thesis text,global_direction text);
create table public.visual_plan_scenes(id uuid primary key,project_id uuid,visual_plan_id uuid,world_report_id uuid,style_bible_id uuid,song_id uuid,status text,scene_number integer,start_time numeric,end_time numeric);
create table public.scene_image_assets(id uuid primary key,project_id uuid,visual_plan_id uuid,scene_id uuid,status text,approved boolean);
create table public.motion_clip_assets(id uuid primary key,project_id uuid,visual_plan_id uuid,scene_id uuid,scene_image_id uuid,status text,approved boolean,video_url text,provider text,model text);
create table public.generation_jobs(id uuid primary key default gen_random_uuid(),project_id uuid,vision_lock_id uuid,visual_plan_id uuid,visual_plan_scene_id uuid,job_type text,idempotency_key text unique,input_snapshot jsonb,status text default 'queued');
alter table public.projects enable row level security;
create policy owner_projects on public.projects for select to authenticated using(owner_id=auth.uid());
alter table public.generation_jobs enable row level security;
create policy owner_jobs on public.generation_jobs for select to authenticated using(exists(select 1 from public.projects p where p.id=generation_jobs.project_id and p.owner_id=auth.uid()));
grant select on all tables in schema public to authenticated;
revoke insert,update,delete on public.generation_jobs from authenticated,anon;

insert into public.projects values('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000002');
insert into public.vision_locks values('00000000-0000-0000-0000-000000000400','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-000000000600','00000000-0000-0000-0000-000000000700',1,'{"song":{"audio_path":"fixture/song.mp3"}}');
insert into public.visual_plans values('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000400','approved','Fixture plan',4,'Fixture thesis','Fixture direction');
insert into public.visual_plan_scenes values('00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-000000000600','00000000-0000-0000-0000-000000000700','approved',1,0,4);
insert into public.scene_image_assets values('00000000-0000-0000-0000-000000000800','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000300','approved',true);
insert into public.motion_clip_assets values('00000000-0000-0000-0000-000000000900','00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000300','00000000-0000-0000-0000-000000000800','approved',true,'https://example.invalid/fixture.mp4','fixture','fixture');

-- Match both production constraints: the historical canonical constraint rejects assembly.
alter table public.generation_jobs add constraint generation_jobs_canonical_job_type_check check(job_type in ('scene_image','scene_motion'));
alter table public.generation_jobs add constraint generation_jobs_job_type_check check(job_type in ('scene_image','scene_motion','assembly'));
alter table public.generation_jobs add constraint generation_jobs_scene_type check((job_type='assembly' and visual_plan_scene_id is null) or (job_type<>'assembly' and visual_plan_scene_id is not null));
