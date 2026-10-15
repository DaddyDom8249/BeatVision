create or replace function public.validate_visual_plan_timeline()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare expected numeric; last_end numeric;
begin
 if new.status <> 'approved' or (tg_op='UPDATE' and old.status='approved') then return new; end if;
 select (vl.snapshot #>> '{song,analysis,duration_seconds}')::numeric into expected
 from vision_locks vl where vl.id=new.vision_lock_id and vl.project_id=new.project_id;
 if expected is null or expected<=0 or expected::text in ('NaN','Infinity','-Infinity')
    or new.duration_seconds is null or abs(new.duration_seconds-expected)>0.05 then
  raise exception 'VISUAL_PLAN_SONG_DURATION_INVALID' using errcode='23514'; end if;
 select max(end_time) into last_end from visual_plan_scenes where visual_plan_id=new.id and project_id=new.project_id;
 if last_end is null or abs(last_end-expected)>0.05 or exists(
  select 1 from (select start_time,end_time,scene_number,row_number() over(order by scene_number) n,
    lag(end_time) over(order by scene_number) previous_end
    from visual_plan_scenes where visual_plan_id=new.id and project_id=new.project_id) t
  where start_time::text in ('NaN','Infinity','-Infinity') or end_time::text in ('NaN','Infinity','-Infinity')
    or start_time<0 or end_time<=start_time or end_time>expected+0.05
    or scene_number<>n or (previous_end is null and abs(start_time)>0.05)
    or (previous_end is not null and abs(start_time-previous_end)>0.05)
 ) then raise exception 'VISUAL_PLAN_TIMELINE_INVALID' using errcode='23514'; end if;
 return new;
end; $$;
create trigger visual_plans_validate_timeline before insert or update of status on public.visual_plans
 for each row execute function public.validate_visual_plan_timeline();
