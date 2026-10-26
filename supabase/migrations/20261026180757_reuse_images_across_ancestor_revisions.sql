-- Follow only this project's actual ancestor chain. Cycles terminate; unrelated,
-- descendant and sibling plans never become sources. No approval is transferred.
create or replace function public.image_reuse_ancestor_plans(p_plan_id uuid)
returns table(plan_id uuid,depth integer) language sql stable security definer set search_path=public,pg_temp as $$
 with recursive ancestors as (
  select parent.id,parent.parent_plan_id,parent.project_id,1 depth,array[child.id,parent.id] seen
  from public.visual_plans child join public.visual_plans parent on parent.id=child.parent_plan_id and parent.project_id=child.project_id
  where child.id=p_plan_id and parent.id<>child.id
  union all
  select parent.id,parent.parent_plan_id,parent.project_id,a.depth+1,a.seen||parent.id
  from ancestors a join public.visual_plans parent on parent.id=a.parent_plan_id and parent.project_id=a.project_id
  where not parent.id=any(a.seen) and a.depth<128
 ) select id,depth from ancestors;
$$;
revoke all on function public.image_reuse_ancestor_plans(uuid) from public,anon,authenticated;
grant execute on function public.image_reuse_ancestor_plans(uuid) to service_role;

create or replace function public.can_reuse_scene_image(p_asset_id uuid,p_scene_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.scene_image_assets a
 join public.visual_plan_scenes old on old.id=a.scene_id and old.visual_plan_id=a.visual_plan_id and old.project_id=a.project_id
 join public.visual_plans parent on parent.id=a.visual_plan_id and parent.project_id=a.project_id
 join public.visual_plan_scenes target on target.id=p_scene_id and target.project_id=a.project_id
 join public.visual_plans child on child.id=target.visual_plan_id and child.project_id=a.project_id
 where a.id=p_asset_id and a.status='approved' and a.approved and nullif(a.storage_path,'') is not null
 and exists(select 1 from public.image_reuse_ancestor_plans(child.id) chain where chain.plan_id=parent.id)
 and parent.vision_lock_id=child.vision_lock_id and parent.world_report_id=child.world_report_id
 and parent.style_bible_id=child.style_bible_id and parent.song_id=child.song_id
 and old.scene_number=target.scene_number and old.start_time=target.start_time and old.end_time=target.end_time
 and old.visual_direction is not distinct from target.visual_direction and old.location is not distinct from target.location
 and old.mood is not distinct from target.mood and old.lyric_moment is not distinct from target.lyric_moment
 and old.continuity_notes is not distinct from target.continuity_notes);
$$;

create or replace function public.revision_media_context(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare plan public.visual_plans; candidates jsonb; history jsonb;
begin
 select vp.* into plan from public.visual_plans vp join public.projects p on p.id=vp.project_id where vp.id=p_plan_id and p.owner_id=auth.uid();
 if plan.id is null then raise exception 'REVISION_MEDIA_FORBIDDEN' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('scene_id',s.id,'source_asset_id',a.id,'scene_number',s.scene_number) order by s.scene_number),'[]') into candidates
 from public.visual_plan_scenes s
 join lateral (
  select source.id from public.image_reuse_ancestor_plans(plan.id) ancestor
  join public.visual_plan_scenes previous on previous.visual_plan_id=ancestor.plan_id and previous.scene_number=s.scene_number
  join public.scene_image_assets source on source.scene_id=previous.id and source.visual_plan_id=ancestor.plan_id
  where public.can_reuse_scene_image(source.id,s.id)
  order by ancestor.depth,source.created_at desc,source.id limit 1
 ) a on true
 where s.visual_plan_id=plan.id and not exists(select 1 from public.scene_image_assets current where current.scene_id=s.id and current.status in ('generated','approved'));
 select coalesce(jsonb_agg(to_jsonb(h) order by h.revision_number desc),'[]') into history from
 (select vp.id,vp.revision_number,vp.status,(select count(*) from public.scene_image_assets a where a.visual_plan_id=vp.id) images,
 (select count(*) from public.motion_clip_assets a where a.visual_plan_id=vp.id) clips
 from public.visual_plans vp where vp.project_id=plan.project_id and vp.id<>plan.id order by revision_number desc limit 50) h;
 return jsonb_build_object('plan_id',plan.id,'parent_plan_id',plan.parent_plan_id,'candidates',candidates,'history',history);
end $$;
