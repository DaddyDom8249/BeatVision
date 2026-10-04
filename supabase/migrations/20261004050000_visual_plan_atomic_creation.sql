-- Atomic Visual Plan creation/recovery.
-- Reuses a stranded draft with zero scenes instead of leaving Phase 4 blocked.
create or replace function public.create_visual_plan(
  p_project_id uuid,
  p_vision_lock_id uuid,
  p_duration_seconds numeric,
  p_creative_thesis text,
  p_global_direction jsonb,
  p_scenes jsonb
) returns public.visual_plans
language plpgsql
set search_path = public
as $function$
declare
  current_plan public.visual_plans;
  lock_row public.vision_locks;
  scene_count integer;
  inserted_count integer;
  result_plan public.visual_plans;
begin
  if (select auth.uid()) is null then
    raise exception 'VISUAL_PLAN_AUTH_REQUIRED' using errcode='42501';
  end if;

  select vl.* into lock_row
  from public.vision_locks vl
  join public.projects p on p.id=vl.project_id
  where vl.id=p_vision_lock_id
    and vl.project_id=p_project_id
    and p.owner_id=(select auth.uid())
    and vl.status='locked';

  if lock_row.id is null then
    raise exception 'VISUAL_PLAN_VISION_LOCK_INVALID' using errcode='42501';
  end if;

  if p_scenes is null or jsonb_typeof(p_scenes) <> 'array' or jsonb_array_length(p_scenes)=0 then
    raise exception 'VISUAL_PLAN_SCENES_REQUIRED' using errcode='23514';
  end if;

  select vp.* into current_plan
  from public.visual_plans vp
  where vp.project_id=p_project_id
  for update;

  if current_plan.id is not null and current_plan.status <> 'draft' then
    raise exception 'VISUAL_PLAN_ALREADY_LOCKED' using errcode='55000';
  end if;

  if current_plan.id is null then
    insert into public.visual_plans (
      project_id,world_report_id,style_bible_id,song_id,vision_lock_id,
      title,duration_seconds,creative_thesis,global_direction
    )
    values (
      p_project_id,lock_row.world_report_id,lock_row.style_bible_id,lock_row.song_id,p_vision_lock_id,
      'Visual Plan',p_duration_seconds,p_creative_thesis,coalesce(p_global_direction,'{}'::jsonb)
    )
    returning * into result_plan;
  else
    if current_plan.world_report_id <> lock_row.world_report_id
       or current_plan.style_bible_id <> lock_row.style_bible_id
       or current_plan.song_id <> lock_row.song_id
       or (current_plan.vision_lock_id is not null and current_plan.vision_lock_id <> p_vision_lock_id) then
      raise exception 'VISUAL_PLAN_LINEAGE_MISMATCH' using errcode='23514';
    end if;

    select count(*) into scene_count
    from public.visual_plan_scenes s
    where s.visual_plan_id=current_plan.id;

    if scene_count > 0 then
      raise exception 'VISUAL_PLAN_ALREADY_HAS_SCENES' using errcode='23505';
    end if;

    update public.visual_plans
    set world_report_id=lock_row.world_report_id,
        style_bible_id=lock_row.style_bible_id,
        song_id=lock_row.song_id,
        vision_lock_id=p_vision_lock_id,
        duration_seconds=p_duration_seconds,
        creative_thesis=p_creative_thesis,
        global_direction=coalesce(p_global_direction,'{}'::jsonb),
        updated_at=now()
    where id=current_plan.id
    returning * into result_plan;
  end if;

  insert into public.visual_plan_scenes (
    visual_plan_id,project_id,world_report_id,style_bible_id,song_id,
    scene_number,section_index,start_time,end_time,title,visual_direction,
    camera_direction,movement_direction,location,mood,lyric_moment,
    transition_style,continuity_notes
  )
  select
    result_plan.id,p_project_id,lock_row.world_report_id,lock_row.style_bible_id,lock_row.song_id,
    (x->>'scene_number')::integer,nullif(x->>'section_index','')::integer,
    (x->>'start_time')::numeric,(x->>'end_time')::numeric,
    coalesce(x->>'title','Section '||(x->>'scene_number')),
    coalesce(x->>'visual_direction',''),coalesce(x->>'camera_direction',''),
    coalesce(x->>'movement_direction',''),coalesce(x->>'location',''),
    coalesce(x->>'mood',''),coalesce(x->>'lyric_moment',''),
    coalesce(x->>'transition_style',''),coalesce(x->>'continuity_notes','')
  from jsonb_array_elements(p_scenes) x;

  get diagnostics inserted_count = row_count;
  if inserted_count <> jsonb_array_length(p_scenes) then
    raise exception 'VISUAL_PLAN_SCENE_INSERT_INCOMPLETE' using errcode='23514';
  end if;

  return result_plan;
end;
$function$;

revoke execute on function public.create_visual_plan(uuid,uuid,numeric,text,jsonb,jsonb) from public;
grant execute on function public.create_visual_plan(uuid,uuid,numeric,text,jsonb,jsonb) to authenticated;
