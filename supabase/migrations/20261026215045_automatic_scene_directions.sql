-- Save the artist-reviewed whole-plan proposal atomically; no automatic approval.
create or replace function public.save_automatic_scene_directions(p_plan_id uuid,p_interpretation_id uuid,p_repairs jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.visual_plans; shot public.visual_plan_scenes; item jsonb; field text; total integer:=0;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id
 where vp.id=p_plan_id and p.owner_id=auth.uid();
 if plan.id is null then raise exception 'AUTO_PLAN_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.projects where id=plan.project_id and owner_id=auth.uid() for update;
 if not found then raise exception 'AUTO_PLAN_FORBIDDEN' using errcode='42501'; end if;
 select * into plan from public.visual_plans where id=p_plan_id for update;
 if plan.status<>'draft' then raise exception 'AUTO_PLAN_DRAFT_REQUIRED'; end if;
 if p_interpretation_id is null or not exists(select 1 from public.songs s where s.id=plan.song_id and s.project_id=plan.project_id
   and s.current_interpretation_id=p_interpretation_id and s.interpretation_confirmed_at is not null) then raise exception 'AUTO_PLAN_INTERPRETATION_STALE'; end if;
 if p_repairs is null or jsonb_typeof(p_repairs)<>'array' or octet_length(p_repairs::text)>8388608 then raise exception 'AUTO_PLAN_INVALID'; end if;
 if jsonb_array_length(p_repairs) not between 1 and 500 then raise exception 'AUTO_PLAN_INVALID'; end if;
 perform 1 from public.visual_plan_scenes where visual_plan_id=plan.id order by id for update;
 if (select count(*) from public.visual_plan_scenes where visual_plan_id=plan.id)<>jsonb_array_length(p_repairs)
   or (select count(distinct value->>'scene_id') from jsonb_array_elements(p_repairs))<>jsonb_array_length(p_repairs) then raise exception 'AUTO_PLAN_INCOMPLETE'; end if;
 for item in select value from jsonb_array_elements(p_repairs) order by value->>'scene_id' loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['scene_id','expected_updated_at','actor','camera_direction','visual_direction','mood','lyric_moment']) then raise exception 'AUTO_PLAN_INVALID'; end if;
  foreach field in array array['scene_id','expected_updated_at','actor','camera_direction','visual_direction','mood','lyric_moment'] loop
   if jsonb_typeof(item->field)<>'string' then raise exception 'AUTO_PLAN_INVALID'; end if;
  end loop;
  if length(btrim(item->>'actor')) not between 8 and 200 or length(btrim(item->>'camera_direction')) not between 4 and 140
    or length(btrim(item->>'visual_direction')) not between 1 and 5000 or length(btrim(item->>'mood')) not between 1 and 400
    or length(item->>'lyric_moment')>1200 then raise exception 'AUTO_PLAN_INVALID'; end if;
  select * into shot from public.visual_plan_scenes where id=(item->>'scene_id')::uuid and visual_plan_id=plan.id and project_id=plan.project_id;
  if shot.id is null or shot.status<>'draft' or shot.world_report_id<>plan.world_report_id or shot.style_bible_id<>plan.style_bible_id or shot.song_id<>plan.song_id then raise exception 'AUTO_PLAN_DRAFT_REQUIRED'; end if;
  if shot.updated_at is distinct from (item->>'expected_updated_at')::timestamptz then raise exception 'AUTO_PLAN_STALE'; end if;
  update public.visual_plan_scenes set visual_direction=item->>'visual_direction',mood=item->>'mood',lyric_moment=item->>'lyric_moment',
    movement_direction=jsonb_build_object('actor',item->>'actor','camera',item->>'camera_direction')::text,camera_direction=item->>'camera_direction' where id=shot.id;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.save_automatic_scene_directions(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_automatic_scene_directions(uuid,uuid,jsonb) to authenticated;
