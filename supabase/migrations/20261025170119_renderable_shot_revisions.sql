-- Append a reviewable short-shot revision. Never rewrite plans, scenes or media.
create or replace function public.create_renderable_shot_revision(
 p_plan_id uuid, p_max_shot_seconds numeric default 5
) returns public.visual_plans
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 source public.visual_plans; draft public.visual_plans; scene public.visual_plan_scenes;
 next_revision integer; total_shots numeric; shot_number integer:=0;
 parts integer; part integer; left_at numeric; right_at numeric; previous_end numeric:=0;
begin
 if auth.uid() is null then raise exception 'VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 select * into source from public.visual_plans where id=p_plan_id;
 if source.id is null or not exists(select 1 from public.projects where id=source.project_id and owner_id=auth.uid()) then
  raise exception 'VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 -- Serialize with existing revision RPCs; lock source scenes before copying saved edits.
 perform 1 from public.projects where id=source.project_id and owner_id=auth.uid() for update;
 if not found then raise exception 'VISUAL_PLAN_NOT_FOUND_OR_FORBIDDEN' using errcode='42501'; end if;
 select * into source from public.visual_plans where id=p_plan_id for update;
 if p_max_shot_seconds is null or p_max_shot_seconds::text in ('NaN','Infinity','-Infinity')
  or p_max_shot_seconds<2 or p_max_shot_seconds>5 then
  raise exception 'VISUAL_PLAN_SHOT_DURATION_INVALID' using errcode='23514'; end if;
 select * into draft from public.visual_plans where parent_plan_id=source.id;
 if draft.id is not null then
  if draft.global_direction->'render_shot_seconds'=to_jsonb(p_max_shot_seconds)
   and draft.global_direction->>'render_source_plan_id'=source.id::text then return draft; end if;
  raise exception 'VISUAL_PLAN_REVISION_ALREADY_EXISTS' using errcode='55000';
 end if;
 if exists(select 1 from public.visual_plans where project_id=source.project_id and revision_number>source.revision_number) then
  raise exception 'VISUAL_PLAN_REVISE_CURRENT_REVISION' using errcode='55000'; end if;
 if source.vision_lock_id is null or source.duration_seconds is null or source.duration_seconds<=0
  or source.duration_seconds::text in ('NaN','Infinity','-Infinity')
  or jsonb_typeof(source.global_direction)<>'object' then
  raise exception 'VISUAL_PLAN_PREREQUISITES_INVALID' using errcode='23514'; end if;
 perform 1 from public.visual_plan_scenes where visual_plan_id=source.id order by scene_number for update;
 -- Reject rather than conceal gaps, overlaps, mixed lineage or malformed numbering.
 for scene in select * from public.visual_plan_scenes where visual_plan_id=source.id order by scene_number loop
  shot_number:=shot_number+1;
  if scene.scene_number<>shot_number or scene.project_id<>source.project_id
   or scene.world_report_id<>source.world_report_id or scene.style_bible_id<>source.style_bible_id
   or scene.song_id<>source.song_id or scene.start_time<>previous_end
   or scene.start_time::text in ('NaN','Infinity','-Infinity') or scene.end_time::text in ('NaN','Infinity','-Infinity')
   or scene.end_time<=scene.start_time then
   raise exception 'VISUAL_PLAN_TIMELINE_INVALID' using errcode='23514'; end if;
  previous_end:=scene.end_time;
 end loop;
 if shot_number=0 or previous_end<>source.duration_seconds then
  raise exception 'VISUAL_PLAN_TIMELINE_INVALID' using errcode='23514'; end if;
 select sum(ceil((end_time-start_time)/p_max_shot_seconds)) into total_shots
 from public.visual_plan_scenes where visual_plan_id=source.id;
 if total_shots>500 then raise exception 'VISUAL_PLAN_TOO_MANY_SCENES' using errcode='23514'; end if;
 select coalesce(max(revision_number),0)+1 into next_revision from public.visual_plans where project_id=source.project_id;
 insert into public.visual_plans(project_id,world_report_id,style_bible_id,song_id,vision_lock_id,title,duration_seconds,
  creative_thesis,global_direction,revision_number,parent_plan_id)
 values(source.project_id,source.world_report_id,source.style_bible_id,source.song_id,source.vision_lock_id,
  source.title,source.duration_seconds,source.creative_thesis,
  source.global_direction||jsonb_build_object('render_shot_seconds',p_max_shot_seconds,'render_source_plan_id',source.id),next_revision,source.id)
 returning * into draft;
 shot_number:=0;
 for scene in select * from public.visual_plan_scenes where visual_plan_id=source.id order by scene_number loop
  parts:=ceil((scene.end_time-scene.start_time)/p_max_shot_seconds);
  left_at:=scene.start_time;
  for part in 1..parts loop
   -- Balanced shots avoid a long section ending in a tiny residual shot.
   right_at:=case when part=parts then scene.end_time else scene.start_time+(scene.end_time-scene.start_time)*part/parts end;
   shot_number:=shot_number+1;
   insert into public.visual_plan_scenes(visual_plan_id,project_id,world_report_id,style_bible_id,song_id,scene_number,
    section_index,start_time,end_time,title,visual_direction,camera_direction,movement_direction,location,mood,
    lyric_moment,transition_style,continuity_notes)
   values(draft.id,scene.project_id,scene.world_report_id,scene.style_bible_id,scene.song_id,shot_number,
    scene.section_index,left_at,right_at,case when parts=1 then scene.title else concat(scene.title,' · Shot ',part,'/',parts) end,
    scene.visual_direction,scene.camera_direction,scene.movement_direction,scene.location,scene.mood,
    scene.lyric_moment,scene.transition_style,scene.continuity_notes);
   left_at:=right_at;
  end loop;
 end loop;
 return draft;
end; $$;
revoke all on function public.create_renderable_shot_revision(uuid,numeric) from public,anon;
grant execute on function public.create_renderable_shot_revision(uuid,numeric) to authenticated;
