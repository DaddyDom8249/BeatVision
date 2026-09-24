-- BeatVision production data-path hardening
-- Keeps Supabase durable relational persistence while exposing one RLS-scoped project aggregate.

alter table public.visual_world_reports
  drop constraint if exists visual_world_reports_creative_match_score_range;

alter table public.visual_world_reports
  add constraint visual_world_reports_creative_match_score_range
  check (
    creative_match_score is null
    or (creative_match_score >= 0 and creative_match_score <= 1)
  );

do $$
declare
  r record;
  index_name text;
begin
  for r in
    select
      c.conname,
      c.conrelid::regclass::text as table_name,
      string_agg(quote_ident(a.attname), ', ' order by k.ord) as columns
    from pg_constraint c
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = k.attnum
    join pg_namespace n
      on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = 'public'
    group by c.conname, c.conrelid
  loop
    index_name := left('idx_fk_' || md5(r.conname), 63);
    execute format(
      'create index if not exists %I on %s (%s)',
      index_name,
      r.table_name,
      r.columns
    );
  end loop;
end
$$;

create or replace function public.beatvision_project_aggregate(p_project_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with project_row as (
  select to_jsonb(p) as data
  from public.projects p
  where p.id = p_project_id
  limit 1
)
select case
  when not exists (select 1 from project_row) then null::jsonb
  else jsonb_build_object(
    'project', (select data from project_row),
    'worldReport', coalesce((
      select to_jsonb(x)
      from public.visual_world_reports x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'scenes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.scene_number)
      from public.storyboard_scenes x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'charEnv', coalesce((
      select to_jsonb(x)
      from public.character_environments x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'scenePrompts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.scene_number)
      from public.scene_visual_prompts x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'scenePreviews', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.scene_previews x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'styleBible', coalesce((
      select to_jsonb(x)
      from public.world_style_bibles x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'characterSheet', coalesce((
      select to_jsonb(x)
      from public.character_sheets x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'envSheet', coalesce((
      select to_jsonb(x)
      from public.environment_sheets x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'sceneImages', coalesce((
      select jsonb_agg(to_jsonb(x) order by coalesce(x.scene_number, x.scene_index), x.created_at)
      from public.scene_images x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'sceneVideos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.scene_number)
      from public.scene_videos x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'motionSettings', coalesce((
      select to_jsonb(x)
      from public.motion_settings x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'motionPlans', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.scene_number)
      from public.scene_motion_plans x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'motionClips', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.scene_number)
      from public.motion_clips x
      where x.project_id = p_project_id
    ), '[]'::jsonb),
    'renderJob', coalesce((
      select to_jsonb(x)
      from public.video_render_jobs x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'finalVideo', coalesce((
      select to_jsonb(x)
      from public.final_videos x
      where x.project_id = p_project_id
      order by x.created_at desc
      limit 1
    ), 'null'::jsonb),
    'changeLogs', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at)
      from public.project_change_log x
      where x.project_id = p_project_id
    ), '[]'::jsonb)
  )
end
$$;

revoke execute on function public.beatvision_project_aggregate(uuid) from public;
revoke execute on function public.beatvision_project_aggregate(uuid) from anon;
grant execute on function public.beatvision_project_aggregate(uuid) to authenticated;
