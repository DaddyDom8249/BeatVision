-- Phase 4 integrity/performance hardening

create index if not exists visual_plans_song_idx on public.visual_plans(song_id);
create index if not exists visual_plan_scenes_world_idx on public.visual_plan_scenes(world_report_id);
create index if not exists visual_plan_scenes_style_idx on public.visual_plan_scenes(style_bible_id);
create index if not exists visual_plan_scenes_song_idx on public.visual_plan_scenes(song_id);

create or replace function public.require_current_visual_plan_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_world_id uuid;
  style_world_id uuid;
  plan_project_id uuid;
  plan_world_id uuid;
  plan_style_id uuid;
  plan_song_id uuid;
begin
  select p.world_report_id into current_world_id from public.projects p where p.id = new.project_id;

  select sb.world_report_id into style_world_id
    from public.style_bibles sb
   where sb.id = new.style_bible_id
     and sb.project_id = new.project_id
     and sb.status = 'approved'
     and sb.approved_at is not null;

  if tg_table_name = 'visual_plan_scenes' then
    select vp.project_id, vp.world_report_id, vp.style_bible_id, vp.song_id
      into plan_project_id, plan_world_id, plan_style_id, plan_song_id
      from public.visual_plans vp
     where vp.id = new.visual_plan_id;

    if plan_project_id is null
       or plan_project_id <> new.project_id
       or plan_world_id <> new.world_report_id
       or plan_style_id <> new.style_bible_id
       or plan_song_id <> new.song_id then
      raise exception 'VISUAL_PLAN_SCENE_LINEAGE_MISMATCH'
        using errcode = '23514',
              detail = 'Visual Plan scenes must use the same project, World, Style Bible, and Song as their parent plan.';
    end if;
  end if;

  if current_world_id is null or current_world_id <> new.world_report_id then
    raise exception 'VISUAL_PLAN_WORLD_NOT_CURRENT'
      using errcode = '23514',
            detail = 'Visual Plan must reference the project''s current World revision.';
  end if;

  if not exists (
    select 1 from public.world_reports wr
     where wr.id = new.world_report_id
       and wr.project_id = new.project_id
       and wr.status = 'completed'
       and wr.confirmed_at is not null
  ) then
    raise exception 'VISUAL_PLAN_WORLD_NOT_CONFIRMED'
      using errcode = '23514',
            detail = 'Visual Plan requires the confirmed Visual World Report.';
  end if;

  if style_world_id is null or style_world_id <> new.world_report_id then
    raise exception 'VISUAL_PLAN_STYLE_NOT_CURRENT'
      using errcode = '23514',
            detail = 'Visual Plan requires an approved Style Bible bound to the current World revision.';
  end if;

  if not exists (
    select 1 from public.songs s
     where s.id = new.song_id
       and s.project_id = new.project_id
       and s.analysis_status = 'completed'
  ) then
    raise exception 'VISUAL_PLAN_SONG_NOT_ANALYZED'
      using errcode = '23514',
            detail = 'Visual Plan requires a completed song analysis.';
  end if;

  return new;
end;
$$;