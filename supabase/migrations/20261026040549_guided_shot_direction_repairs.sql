-- Optional beginner assistance saves only owner-reviewed draft direction fields.
create or replace function public.save_guided_shot_directions(p_plan_id uuid,p_repairs jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.visual_plans; shot public.visual_plan_scenes; item jsonb; actor text; camera text; total integer:=0;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id
 where vp.id=p_plan_id and p.owner_id=auth.uid();
 if plan.id is null then raise exception 'GUIDED_REPAIR_FORBIDDEN' using errcode='42501'; end if;
 perform 1 from public.projects where id=plan.project_id and owner_id=auth.uid() for update;
 select * into plan from public.visual_plans where id=p_plan_id for update;
 if plan.status<>'draft' then raise exception 'GUIDED_REPAIR_DRAFT_REQUIRED'; end if;
 if p_repairs is null or jsonb_typeof(p_repairs)<>'array' then raise exception 'GUIDED_REPAIR_INVALID'; end if;
 if jsonb_array_length(p_repairs) not between 1 and 500 then raise exception 'GUIDED_REPAIR_INVALID'; end if;
 if (select count(distinct value->>'scene_id') from jsonb_array_elements(p_repairs))<>jsonb_array_length(p_repairs) then raise exception 'GUIDED_REPAIR_INVALID'; end if;
 for item in select value from jsonb_array_elements(p_repairs) loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['scene_id','expected_movement_direction','expected_camera_direction','actor','camera'])
   or jsonb_typeof(item->'scene_id')<>'string' or jsonb_typeof(item->'actor')<>'string' or jsonb_typeof(item->'camera')<>'string'
   then raise exception 'GUIDED_REPAIR_INVALID'; end if;
  actor:=btrim(item->>'actor'); camera:=btrim(item->>'camera');
  if length(actor) not between 8 and 200 or length(camera) not between 4 and 140 then raise exception 'GUIDED_REPAIR_INVALID'; end if;
  select * into shot from public.visual_plan_scenes where id=(item->>'scene_id')::uuid and visual_plan_id=plan.id and project_id=plan.project_id for update;
  if shot.id is null or shot.status<>'draft' then raise exception 'GUIDED_REPAIR_DRAFT_REQUIRED'; end if;
  if shot.movement_direction is distinct from item->>'expected_movement_direction'
   or shot.camera_direction is distinct from item->>'expected_camera_direction' then raise exception 'GUIDED_REPAIR_STALE'; end if;
  update public.visual_plan_scenes set movement_direction=jsonb_build_object('actor',actor,'camera',camera)::text,camera_direction=camera where id=shot.id;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function public.save_guided_shot_directions(uuid,jsonb) from public,anon;
grant execute on function public.save_guided_shot_directions(uuid,jsonb) to authenticated;
