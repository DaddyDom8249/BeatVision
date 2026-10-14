-- REQUIRES MANUAL APPLY. NOT APPLIED TO LIVE SUPABASE.
-- Shot control and retakes (plan phase: first/last keyframe, take history, retake).
--
-- Depends on objects that are NOT defined in this repository's migrations:
-- public.scene_image_assets, public.motion_clip_assets, public.generation_jobs,
-- public.projects and public.visual_plan_scenes. Column names used below are
-- taken from the repo's existing approval RPCs (20261006231126) and the
-- beatvision-generation edge function. Verify them against live before apply.
--
-- PRE-APPLY CHECK: the unique indexes fail if live already has more than one
-- approved image or clip per scene (audit H3). Find those rows first:
--   select visual_plan_id, scene_id, count(*) from public.scene_image_assets
--    where approved group by 1,2 having count(*) > 1;
--   (and the same for public.motion_clip_assets)
-- A person has to choose which take stays approved. Do not auto-resolve.

-- 1. Exactly one approved take per scene, enforced by the database.
create unique index if not exists scene_image_one_approved_per_scene
  on public.scene_image_assets(visual_plan_id, scene_id) where approved;
create unique index if not exists motion_clip_one_approved_per_scene
  on public.motion_clip_assets(visual_plan_id, scene_id) where approved;

-- 2. First approval only succeeds if nothing is approved yet. Replacing an
--    approved take must go through replace_approved_* below.
create or replace function public.approve_scene_image_asset(p_asset_id uuid)
returns public.scene_image_assets
language plpgsql security definer set search_path = public
as $$
declare
  asset public.scene_image_assets;
  project_owner uuid;
begin
  select p.owner_id into project_owner
  from public.scene_image_assets a join public.projects p on p.id = a.project_id
  where a.id = p_asset_id;
  if project_owner is null or project_owner <> auth.uid() then
    raise exception 'SCENE_IMAGE_ASSET_NOT_FOUND' using errcode = '42501';
  end if;

  select a.* into asset
  from public.scene_image_assets a
  join public.generation_jobs g on g.id = a.generation_job_id
  where a.id = p_asset_id and a.status = 'generated' and a.approved = false
    and g.project_id = a.project_id and g.visual_plan_id = a.visual_plan_id
    and g.visual_plan_scene_id = a.scene_id and g.job_type = 'scene_image'
    and g.status = 'completed' and trim(a.image_url) <> '' and a.image_url ~* '^https?://'
  for update of a;
  if asset.id is null then
    raise exception 'SCENE_IMAGE_ASSET_NOT_APPROVABLE' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtext('scene_image_approval:' || asset.scene_id::text));
  if exists (select 1 from public.scene_image_assets o
              where o.visual_plan_id = asset.visual_plan_id and o.scene_id = asset.scene_id
                and o.approved and o.id <> asset.id) then
    raise exception 'SCENE_IMAGE_ALREADY_APPROVED' using errcode = '55000',
      hint = 'Use replace_approved_scene_image to intentionally swap the approved take.';
  end if;

  update public.scene_image_assets set status = 'approved', approved = true
   where id = p_asset_id returning * into asset;
  return asset;
end;
$$;

create or replace function public.approve_motion_clip_asset(p_asset_id uuid)
returns public.motion_clip_assets
language plpgsql security definer set search_path = public
as $$
declare
  asset public.motion_clip_assets;
  project_owner uuid;
begin
  select p.owner_id into project_owner
  from public.motion_clip_assets a join public.projects p on p.id = a.project_id
  where a.id = p_asset_id;
  if project_owner is null or project_owner <> auth.uid() then
    raise exception 'MOTION_CLIP_ASSET_NOT_FOUND' using errcode = '42501';
  end if;

  select m.* into asset
  from public.motion_clip_assets m
  join public.generation_jobs g on g.id = m.generation_job_id
  join public.scene_image_assets i on i.id = m.scene_image_id
   and i.project_id = m.project_id and i.visual_plan_id = m.visual_plan_id
   and i.scene_id = m.scene_id and i.status = 'approved' and i.approved = true
  where m.id = p_asset_id and m.status = 'generated' and m.approved = false
    and g.project_id = m.project_id and g.visual_plan_id = m.visual_plan_id
    and g.visual_plan_scene_id = m.scene_id and g.job_type = 'scene_motion'
    and g.status = 'completed' and trim(m.video_url) <> '' and m.video_url ~* '^https?://'
  for update of m;
  if asset.id is null then
    raise exception 'MOTION_CLIP_ASSET_NOT_APPROVABLE' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtext('motion_clip_approval:' || asset.scene_id::text));
  if exists (select 1 from public.motion_clip_assets o
              where o.visual_plan_id = asset.visual_plan_id and o.scene_id = asset.scene_id
                and o.approved and o.id <> asset.id) then
    raise exception 'MOTION_CLIP_ALREADY_APPROVED' using errcode = '55000',
      hint = 'Use replace_approved_motion_clip to intentionally swap the approved take.';
  end if;

  update public.motion_clip_assets set status = 'approved', approved = true
   where id = p_asset_id returning * into asset;
  return asset;
end;
$$;

-- 3. Intentional swap. The caller must name the take it is unapproving
--    (p_expected_current_id). If that is no longer the approved take, the
--    call fails, so a stale tab cannot replace work it never saw. The old
--    take is demoted to 'generated' and kept. Nothing is deleted.
create or replace function public.replace_approved_scene_image(p_asset_id uuid, p_expected_current_id uuid)
returns public.scene_image_assets
language plpgsql security definer set search_path = public
as $$
declare
  target public.scene_image_assets;
  current_id uuid;
begin
  select a.* into target from public.scene_image_assets a
  join public.projects p on p.id = a.project_id
  where a.id = p_asset_id and p.owner_id = auth.uid();
  if target.id is null then
    raise exception 'SCENE_IMAGE_ASSET_NOT_FOUND' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('scene_image_approval:' || target.scene_id::text));
  select id into current_id from public.scene_image_assets
   where visual_plan_id = target.visual_plan_id and scene_id = target.scene_id and approved
   for update;
  if current_id is distinct from p_expected_current_id or current_id is null then
    raise exception 'SCENE_IMAGE_APPROVAL_CHANGED' using errcode = '40001';
  end if;
  -- Changing the image under an approved clip would break motion lineage.
  if exists (select 1 from public.motion_clip_assets m where m.scene_image_id = current_id and m.approved) then
    raise exception 'SCENE_IMAGE_HAS_APPROVED_MOTION' using errcode = '55000',
      hint = 'Replace or unapprove the approved motion clip for this scene first.';
  end if;

  update public.scene_image_assets set status = 'generated', approved = false where id = current_id;
  return public.approve_scene_image_asset(p_asset_id);
end;
$$;

create or replace function public.replace_approved_motion_clip(p_asset_id uuid, p_expected_current_id uuid)
returns public.motion_clip_assets
language plpgsql security definer set search_path = public
as $$
declare
  target public.motion_clip_assets;
  current_id uuid;
begin
  select a.* into target from public.motion_clip_assets a
  join public.projects p on p.id = a.project_id
  where a.id = p_asset_id and p.owner_id = auth.uid();
  if target.id is null then
    raise exception 'MOTION_CLIP_ASSET_NOT_FOUND' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('motion_clip_approval:' || target.scene_id::text));
  select id into current_id from public.motion_clip_assets
   where visual_plan_id = target.visual_plan_id and scene_id = target.scene_id and approved
   for update;
  if current_id is distinct from p_expected_current_id or current_id is null then
    raise exception 'MOTION_CLIP_APPROVAL_CHANGED' using errcode = '40001';
  end if;

  update public.motion_clip_assets set status = 'generated', approved = false where id = current_id;
  return public.approve_motion_clip_asset(p_asset_id);
end;
$$;

-- 4. Per-scene first/last keyframe selection, chosen from the scene's own image takes.
create table if not exists public.scene_keyframe_selections (
  scene_id uuid primary key references public.visual_plan_scenes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  visual_plan_id uuid not null,
  first_frame_asset_id uuid references public.scene_image_assets(id),
  last_frame_asset_id uuid references public.scene_image_assets(id),
  updated_at timestamptz not null default now(),
  constraint scene_keyframes_distinct check (first_frame_asset_id is null or first_frame_asset_id is distinct from last_frame_asset_id)
);
alter table public.scene_keyframe_selections enable row level security;
drop policy if exists scene_keyframes_owner_read on public.scene_keyframe_selections;
create policy scene_keyframes_owner_read on public.scene_keyframe_selections for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));
revoke insert, update, delete on public.scene_keyframe_selections from anon, authenticated;

create or replace function public.set_scene_keyframe(p_scene_id uuid, p_role text, p_asset_id uuid)
returns public.scene_keyframe_selections
language plpgsql security definer set search_path = public
as $$
declare
  scene_row public.visual_plan_scenes;
  result public.scene_keyframe_selections;
begin
  if p_role not in ('first', 'last') then
    raise exception 'SCENE_KEYFRAME_ROLE_INVALID' using errcode = '22023';
  end if;
  select s.* into scene_row from public.visual_plan_scenes s
  join public.projects p on p.id = s.project_id
  where s.id = p_scene_id and p.owner_id = auth.uid() and s.status = 'approved';
  if scene_row.id is null then
    raise exception 'SCENE_NOT_FOUND' using errcode = '42501';
  end if;
  if p_asset_id is not null and not exists (
    select 1 from public.scene_image_assets a
     where a.id = p_asset_id and a.scene_id = p_scene_id and a.project_id = scene_row.project_id
       and a.visual_plan_id = scene_row.visual_plan_id and a.status in ('generated', 'approved')
       and a.image_url ~* '^https?://') then
    raise exception 'SCENE_KEYFRAME_ASSET_INVALID' using errcode = '55000';
  end if;

  insert into public.scene_keyframe_selections as k (scene_id, project_id, visual_plan_id, first_frame_asset_id, last_frame_asset_id)
  values (p_scene_id, scene_row.project_id, scene_row.visual_plan_id,
          case when p_role = 'first' then p_asset_id end,
          case when p_role = 'last' then p_asset_id end)
  on conflict (scene_id) do update set
    first_frame_asset_id = case when p_role = 'first' then excluded.first_frame_asset_id
                                when k.first_frame_asset_id = p_asset_id then null else k.first_frame_asset_id end,
    last_frame_asset_id  = case when p_role = 'last' then excluded.last_frame_asset_id
                                when k.last_frame_asset_id = p_asset_id then null else k.last_frame_asset_id end,
    updated_at = now()
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.approve_scene_image_asset(uuid) from public, anon;
revoke execute on function public.approve_motion_clip_asset(uuid) from public, anon;
revoke execute on function public.replace_approved_scene_image(uuid, uuid) from public, anon;
revoke execute on function public.replace_approved_motion_clip(uuid, uuid) from public, anon;
revoke execute on function public.set_scene_keyframe(uuid, text, uuid) from public, anon;
grant execute on function public.approve_scene_image_asset(uuid) to authenticated;
grant execute on function public.approve_motion_clip_asset(uuid) to authenticated;
grant execute on function public.replace_approved_scene_image(uuid, uuid) to authenticated;
grant execute on function public.replace_approved_motion_clip(uuid, uuid) to authenticated;
grant execute on function public.set_scene_keyframe(uuid, text, uuid) to authenticated;
