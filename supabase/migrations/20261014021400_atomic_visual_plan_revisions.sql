-- Add revisions without changing any previous approved row or asset.
alter table public.visual_plans add column revision_number integer not null default 1 check(revision_number>0),
 add column parent_plan_id uuid references public.visual_plans(id) on delete restrict;
create unique index visual_plans_project_revision_unique on public.visual_plans(project_id,revision_number);
create unique index visual_plans_one_child_revision on public.visual_plans(parent_plan_id) where parent_plan_id is not null;
alter table public.visual_plans drop constraint visual_plans_project_unique;

create or replace function public.create_visual_plan_revision(p_plan_id uuid)
returns public.visual_plans language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.visual_plans; draft public.visual_plans; next_revision int;
begin
 select * into source from visual_plans where id=p_plan_id;
 if source.id is null or not exists(select 1 from projects where id=source.project_id and owner_id=auth.uid()) then raise exception 'VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from projects where id=source.project_id for update;
 select * into draft from visual_plans where parent_plan_id=source.id;
 if draft.id is not null then return draft; end if;
 if source.status<>'approved' then raise exception 'VISUAL_PLAN_REVISION_REQUIRES_APPROVED_SOURCE' using errcode='55000'; end if;
 if exists(select 1 from visual_plans where project_id=source.project_id and revision_number>source.revision_number) then raise exception 'VISUAL_PLAN_REVISE_CURRENT_REVISION' using errcode='55000'; end if;
 select coalesce(max(revision_number),0)+1 into next_revision from visual_plans where project_id=source.project_id;
 insert into visual_plans(project_id,world_report_id,style_bible_id,song_id,vision_lock_id,title,duration_seconds,creative_thesis,global_direction,revision_number,parent_plan_id)
 values(source.project_id,source.world_report_id,source.style_bible_id,source.song_id,source.vision_lock_id,source.title,source.duration_seconds,source.creative_thesis,source.global_direction,next_revision,source.id) returning * into draft;
 insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes)
 select draft.id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes from visual_plan_scenes where visual_plan_id=source.id order by scene_number;
 return draft;
end; $$;
revoke all on function public.create_visual_plan_revision(uuid) from public,anon;
grant execute on function public.create_visual_plan_revision(uuid) to authenticated;

create or replace function public.creative_text(value jsonb)
returns text language sql immutable set search_path=public,pg_temp as $$
 select case when value is null or value='null'::jsonb then '' when jsonb_typeof(value)='string' then value #>> '{}' else value::text end;
$$;

create or replace function public.create_visual_plan(p_project_id uuid)
returns public.visual_plans language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.world_reports; st public.style_bibles; song public.songs; lock public.vision_locks; plan public.visual_plans;
 windows jsonb; segment jsonb; total numeric; start_at numeric; end_at numeric; scene_number int:=0; moment text;
begin
 perform 1 from projects where id=p_project_id and owner_id=auth.uid() for update;
 if not found then raise exception 'VISUAL_PLAN_PROJECT_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 select * into plan from visual_plans where project_id=p_project_id order by revision_number desc limit 1;
 if plan.id is not null then return plan; end if;
 select wr.* into w from world_reports wr join projects p on p.world_report_id=wr.id where p.id=p_project_id and wr.project_id=p_project_id and wr.status='completed' and wr.confirmed_at is not null;
 select * into st from style_bibles where project_id=p_project_id and world_report_id=w.id and status='approved' and approved_at is not null;
 select * into song from songs where project_id=p_project_id and analysis_status='completed';
 total:=(song.analysis->>'duration_seconds')::numeric;
 if w.id is null or st.id is null or song.id is null or total is null or total<=0 or total::text in ('NaN','Infinity','-Infinity') then raise exception 'VISUAL_PLAN_PREREQUISITES_INVALID' using errcode='23514'; end if;
 lock:=public.create_vision_lock(p_project_id);
 windows:=song.analysis->'sections';
 if windows is null or jsonb_typeof(windows)<>'array' or jsonb_array_length(windows)=0 then windows:=jsonb_build_array(jsonb_build_object('index',0,'start_time',0,'end_time',total)); end if;
 if jsonb_array_length(windows)>500 then raise exception 'VISUAL_PLAN_TOO_MANY_SCENES' using errcode='23514'; end if;
 insert into visual_plans(project_id,world_report_id,style_bible_id,song_id,vision_lock_id,title,duration_seconds,creative_thesis,global_direction)
 values(p_project_id,w.id,st.id,song.id,lock.id,'Visual Plan',total,coalesce(nullif(creative_text(w.emotional_arc),''),creative_text(w.mood)),jsonb_build_object('visual_language',w.visual_language,'cinematography',st.cinematography,'color_lighting',st.color_lighting,'atmosphere',st.atmosphere,'movement',st.movement,'continuity_rules',st.continuity_rules)) returning * into plan;
 for segment in select value from jsonb_array_elements(windows) loop
  scene_number:=scene_number+1; start_at:=(segment->>'start_time')::numeric; end_at:=(segment->>'end_time')::numeric;
  if start_at is null or end_at is null or start_at<0 or end_at<=start_at or end_at>total+0.05 then raise exception 'VISUAL_PLAN_SECTION_INVALID' using errcode='23514'; end if;
  select coalesce(string_agg(t->>'text',' ' order by (t->>'start')::numeric),'') into moment
  from jsonb_array_elements(case when jsonb_typeof(song.analysis->'transcript_segments')='array' then song.analysis->'transcript_segments' else '[]'::jsonb end) t
  where (t->>'start')::numeric<end_at and (t->>'end')::numeric>start_at;
  insert into visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,lyric_moment,transition_style,continuity_notes)
  values(plan.id,p_project_id,w.id,st.id,song.id,scene_number,(segment->>'index')::int,start_at,end_at,
   concat('Section ',scene_number,' (',start_at,'–',end_at,'s)'),
   concat_ws(' — ',nullif(creative_text(w.visual_language),''),nullif(creative_text(w.emotional_arc),''),nullif(moment,'')),
   creative_text(st.cinematography),creative_text(st.movement),creative_text(w.environments),creative_text(w.mood),moment,
   case when scene_number=1 then 'Opening transition' else 'Match the musical transition.' end,creative_text(st.continuity_rules));
 end loop;
 return plan;
end; $$;
revoke all on function public.create_visual_plan(uuid) from public,anon;
grant execute on function public.create_visual_plan(uuid) to authenticated;
-- Creation/revisions are atomic RPCs. Existing owner-scoped scene editing and approval remain.
revoke insert on public.visual_plans,public.visual_plan_scenes from public,anon,authenticated;
