create role authenticated;
create role anon;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to authenticated,anon,service_role;
-- Reproduce the confirmed production postgres default grants.
alter default privileges for role postgres in schema public grant all on tables to authenticated,anon,service_role;
create table public.final_videos(id integer primary key,owner_id uuid not null,status text not null);
alter table public.final_videos enable row level security;
create policy owner_videos on public.final_videos for all to authenticated
using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create function public.prevent_approved_video_delete() returns trigger language plpgsql as $$
begin if old.status='approved' then raise exception 'APPROVED_RECORD_IMMUTABLE'; end if;return old;end;$$;
create trigger approved_video_delete before delete on public.final_videos for each row execute function public.prevent_approved_video_delete();
insert into public.final_videos values
(1,'00000000-0000-0000-0000-000000000001','draft'),
(2,'00000000-0000-0000-0000-000000000002','approved');
