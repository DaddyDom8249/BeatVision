-- P0-B: make World confirmation and revision creation authoritative,
-- transactional, owner-scoped database operations.
begin;

create or replace function public.confirm_world_atomic(p_project_id uuid)
returns public.world_reports
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_project public.projects;
  v_current public.world_reports;
  v_confirmed public.world_reports;
begin
  if v_uid is null then
    raise exception 'WORLD_CONFIRM_UNAUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_project from public.projects
   where id = p_project_id and owner_id = v_uid for update;
  if not found then
    raise exception 'WORLD_PROJECT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  select wr.* into v_current from public.world_reports wr
   where wr.project_id = p_project_id
   order by wr.revision_number desc
   limit 1
   for update;

  if not found or v_current.status <> 'completed' then
    raise exception 'WORLD_NOT_READY';
  end if;

  if v_project.world_report_id is not null
     and v_project.world_report_id <> v_current.id then
    raise exception 'WORLD_POINTER_MISMATCH';
  end if;

  if v_current.confirmed_at is not null then
    if v_project.world_report_id = v_current.id
       and v_project.world_confirmed_at is not null then
      return v_current;
    end if;
    raise exception 'WORLD_CONFIRM_STATE_INCONSISTENT';
  end if;

  update public.world_reports
     set confirmed_at = now()
   where id = v_current.id
     and project_id = p_project_id
     and confirmed_at is null
   returning * into v_confirmed;

  if not found then
    raise exception 'WORLD_CONFIRM_CONFLICT';
  end if;

  update public.projects
     set world_report_id = v_confirmed.id,
         world_confirmed_at = v_confirmed.confirmed_at
   where id = p_project_id and owner_id = v_uid;

  if not found then
    raise exception 'WORLD_PROJECT_UPDATE_FAILED';
  end if;

  return v_confirmed;
end;
$$;

create or replace function public.create_world_revision_atomic(
  p_project_id uuid,
  p_world jsonb,
  p_artist_edits jsonb
)
returns public.world_reports
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_project public.projects;
  v_current public.world_reports;
  v_revision public.world_reports;
  v_next_revision integer;
  v_required_fields text[] := array[
    'mood','emotional_arc','visual_language','cinematography',
    'environments','color_lighting','motifs','atmosphere','movement',
    'continuity_rules','immutable_continuity'
  ];
begin
  if v_uid is null then
    raise exception 'WORLD_REVISION_UNAUTHENTICATED' using errcode = '42501';
  end if;

  if jsonb_typeof(p_world) <> 'object' then
    raise exception 'WORLD_REVISION_INVALID_WORLD';
  end if;
  if not (p_world ?& v_required_fields) then
    raise exception 'WORLD_REVISION_WORLD_INCOMPLETE';
  end if;
  if exists (
    select 1 from unnest(v_required_fields) as required_field
    where p_world -> required_field is null
       or p_world -> required_field = 'null'::jsonb
  ) then
    raise exception 'WORLD_REVISION_WORLD_INCOMPLETE';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_world) as supplied_field
    where not (supplied_field = any(v_required_fields))
  ) then
    raise exception 'WORLD_REVISION_FIELDS_NOT_ALLOWED';
  end if;
  if p_artist_edits is null or jsonb_typeof(p_artist_edits) <> 'object' then
    raise exception 'WORLD_REVISION_EDITS_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_artist_edits) as supplied_field
    where not (supplied_field = any(v_required_fields))
  ) then
    raise exception 'WORLD_REVISION_EDIT_FIELDS_NOT_ALLOWED';
  end if;

  select * into v_project from public.projects
   where id = p_project_id and owner_id = v_uid for update;
  if not found then
    raise exception 'WORLD_PROJECT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;

  if v_project.world_report_id is null or v_project.world_confirmed_at is null then
    raise exception 'WORLD_REVISION_REQUIRES_CONFIRMED';
  end if;

  select wr.* into v_current from public.world_reports wr
   where wr.id = v_project.world_report_id and wr.project_id = p_project_id
   for update;
  if not found or v_current.status <> 'completed' or v_current.confirmed_at is null then
    raise exception 'WORLD_REVISION_CURRENT_REPORT_INVALID';
  end if;

  select coalesce(max(wr.revision_number), 0) + 1
    into v_next_revision
    from public.world_reports wr
   where wr.project_id = p_project_id;

  insert into public.world_reports (
    project_id, world_id, revision_number, status,
    mood, emotional_arc, visual_language, cinematography, environments,
    color_lighting, motifs, atmosphere, movement, continuity_rules,
    immutable_continuity, raw_report, provider, provider_request_id,
    error_code, error_message, confirmed_at
  )
  values (
    p_project_id, v_current.world_id, v_next_revision, 'completed',
    p_world -> 'mood', p_world -> 'emotional_arc', p_world -> 'visual_language',
    p_world -> 'cinematography', p_world -> 'environments',
    p_world -> 'color_lighting', p_world -> 'motifs', p_world -> 'atmosphere',
    p_world -> 'movement', p_world -> 'continuity_rules',
    p_world -> 'immutable_continuity',
    coalesce(v_current.raw_report, '{}'::jsonb) ||
      jsonb_build_object(
        'parent_world_report_id', v_current.id,
        'parent_revision_number', v_current.revision_number,
        'artist_edits', p_artist_edits,
        'revised_at', now()
      ),
    v_current.provider, v_current.provider_request_id, null, null, null
  )
  returning * into v_revision;

  update public.projects
     set world_report_id = v_revision.id, world_confirmed_at = null
   where id = p_project_id and owner_id = v_uid;
  if not found then
    raise exception 'WORLD_PROJECT_UPDATE_FAILED';
  end if;

  return v_revision;
end;
$$;

revoke all on function public.confirm_world_atomic(uuid) from public;
revoke all on function public.create_world_revision_atomic(uuid, jsonb, jsonb) from public;
grant execute on function public.confirm_world_atomic(uuid) to authenticated;
grant execute on function public.create_world_revision_atomic(uuid, jsonb, jsonb) to authenticated;

commit;
