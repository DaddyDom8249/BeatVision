-- Atomic storyboard replacement used by the canonical Arena-backed generation path.
create or replace function public.beatvision_replace_storyboard(
  p_project_id uuid,
  p_scenes jsonb
)
returns setof public.storyboard_scenes
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  expected integer := 1;
  incoming_numbers integer[] := '{}';
begin
  if not public.beatvision_project_owner(p_project_id) then
    raise exception 'Project access denied';
  end if;

  if jsonb_typeof(p_scenes) <> 'array' or jsonb_array_length(p_scenes) = 0 then
    raise exception 'Storyboard must contain at least one scene';
  end if;

  for item in select value from jsonb_array_elements(p_scenes) value loop
    if coalesce((item->>'scene_number')::integer, 0) <> expected then
      raise exception 'Storyboard scene numbers must be sequential starting at 1';
    end if;
    incoming_numbers := array_append(incoming_numbers, expected);
    expected := expected + 1;
  end loop;

  -- Update existing scene rows in place so stable IDs survive regeneration.
  for item in select value from jsonb_array_elements(p_scenes) value loop
    update public.storyboard_scenes
    set
      timestamp_range = nullif(item->>'timestamp_range',''),
      scene_title = nullif(item->>'scene_title',''),
      visual_description = nullif(item->>'visual_description',''),
      camera_direction = nullif(item->>'camera_direction',''),
      mood = nullif(item->>'mood',''),
      location = nullif(item->>'location',''),
      lyric_moment = nullif(item->>'lyric_moment',''),
      transition_style = nullif(item->>'transition_style',''),
      approved = false,
      needs_review = false,
      updated_after_approval = false,
      last_approved_at = null,
      updated_at = now()
    where project_id = p_project_id
      and scene_number = (item->>'scene_number')::integer;

    if not found then
      insert into public.storyboard_scenes (
        project_id, scene_number, timestamp_range, scene_title,
        visual_description, camera_direction, mood, location,
        lyric_moment, transition_style, approved, needs_review,
        updated_after_approval, last_approved_at
      ) values (
        p_project_id,
        (item->>'scene_number')::integer,
        nullif(item->>'timestamp_range',''),
        nullif(item->>'scene_title',''),
        nullif(item->>'visual_description',''),
        nullif(item->>'camera_direction',''),
        nullif(item->>'mood',''),
        nullif(item->>'location',''),
        nullif(item->>'lyric_moment',''),
        nullif(item->>'transition_style',''),
        false, false, false, null
      );
    end if;
  end loop;

  -- Remove only scenes that no longer exist in the validated replacement.
  delete from public.storyboard_scenes
  where project_id = p_project_id
    and not (scene_number = any(incoming_numbers));

  return query
  select *
  from public.storyboard_scenes
  where project_id = p_project_id
  order by scene_number;
end;
$$;

revoke all on function public.beatvision_replace_storyboard(uuid,jsonb) from public;
grant execute on function public.beatvision_replace_storyboard(uuid,jsonb) to authenticated;