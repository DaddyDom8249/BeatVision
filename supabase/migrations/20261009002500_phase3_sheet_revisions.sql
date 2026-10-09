-- Approved Phase 3 sheets remain immutable. Intentional creative changes are
-- represented by a new draft row with explicit lineage.

alter table public.characters
  add column if not exists supersedes_character_id uuid references public.characters(id) on delete restrict,
  add column if not exists revision_number integer not null default 1 check (revision_number > 0);

alter table public.environments
  add column if not exists supersedes_environment_id uuid references public.environments(id) on delete restrict,
  add column if not exists revision_number integer not null default 1 check (revision_number > 0);

create unique index if not exists characters_single_direct_revision_idx
  on public.characters(supersedes_character_id)
  where supersedes_character_id is not null;

create unique index if not exists environments_single_direct_revision_idx
  on public.environments(supersedes_environment_id)
  where supersedes_environment_id is not null;

create or replace function public.create_character_revision(
  p_character_id uuid,
  p_sheet jsonb default null
)
returns public.characters
language plpgsql
set search_path = public
as $function$
declare
  source_row public.characters;
  existing_row public.characters;
  result_row public.characters;
begin
  select c.* into source_row
    from public.characters c
   where c.id = p_character_id
     and c.status = 'approved'
     and exists (
       select 1 from public.projects p
        where p.id = c.project_id
          and p.owner_id = (select auth.uid())
     )
   for update;

  if source_row.id is null then
    raise exception 'CHARACTER_NOT_FOUND_OR_NOT_APPROVED'
      using errcode = '42501';
  end if;
  if p_sheet is not null and jsonb_typeof(p_sheet) <> 'object' then
    raise exception 'CHARACTER_REVISION_SHEET_INVALID'
      using errcode = '22023';
  end if;

  select c.* into existing_row
    from public.characters c
   where c.supersedes_character_id = source_row.id
   limit 1;

  if existing_row.id is not null then
    if existing_row.status = 'draft' then
      if p_sheet is not null then
        update public.characters c
           set sheet = p_sheet
         where c.id = existing_row.id
         returning c.* into existing_row;
      end if;
      return existing_row;
    end if;
    raise exception 'CHARACTER_REVISION_ALREADY_EXISTS'
      using errcode = '23505',
            detail = 'Create the next revision from the current approved revision.';
  end if;

  insert into public.characters (
    project_id, world_report_id, style_bible_id, name, status, sheet,
    supersedes_character_id, revision_number
  ) values (
    source_row.project_id,
    source_row.world_report_id,
    source_row.style_bible_id,
    source_row.name,
    'draft',
    coalesce(p_sheet, source_row.sheet),
    source_row.id,
    source_row.revision_number + 1
  ) returning * into result_row;

  return result_row;
end;
$function$;

create or replace function public.create_environment_revision(
  p_environment_id uuid,
  p_sheet jsonb default null
)
returns public.environments
language plpgsql
set search_path = public
as $function$
declare
  source_row public.environments;
  existing_row public.environments;
  result_row public.environments;
begin
  select e.* into source_row
    from public.environments e
   where e.id = p_environment_id
     and e.status = 'approved'
     and exists (
       select 1 from public.projects p
        where p.id = e.project_id
          and p.owner_id = (select auth.uid())
     )
   for update;

  if source_row.id is null then
    raise exception 'ENVIRONMENT_NOT_FOUND_OR_NOT_APPROVED'
      using errcode = '42501';
  end if;
  if p_sheet is not null and jsonb_typeof(p_sheet) <> 'object' then
    raise exception 'ENVIRONMENT_REVISION_SHEET_INVALID'
      using errcode = '22023';
  end if;

  select e.* into existing_row
    from public.environments e
   where e.supersedes_environment_id = source_row.id
   limit 1;

  if existing_row.id is not null then
    if existing_row.status = 'draft' then
      if p_sheet is not null then
        update public.environments e
           set sheet = p_sheet
         where e.id = existing_row.id
         returning e.* into existing_row;
      end if;
      return existing_row;
    end if;
    raise exception 'ENVIRONMENT_REVISION_ALREADY_EXISTS'
      using errcode = '23505',
            detail = 'Create the next revision from the current approved revision.';
  end if;

  insert into public.environments (
    project_id, world_report_id, style_bible_id, name, status, sheet,
    supersedes_environment_id, revision_number
  ) values (
    source_row.project_id,
    source_row.world_report_id,
    source_row.style_bible_id,
    source_row.name,
    'draft',
    coalesce(p_sheet, source_row.sheet),
    source_row.id,
    source_row.revision_number + 1
  ) returning * into result_row;

  return result_row;
end;
$function$;

revoke all on function public.create_character_revision(uuid, jsonb) from public;
grant execute on function public.create_character_revision(uuid, jsonb) to authenticated;
revoke all on function public.create_environment_revision(uuid, jsonb) from public;
grant execute on function public.create_environment_revision(uuid, jsonb) to authenticated;

-- A revision can be drafted after a Vision Lock, but it cannot become the
-- approved current version until the product has an explicit lock/plan revision
-- transition. This prevents stale frozen snapshots.
create or replace function public.approve_character(p_character_id uuid)
returns public.characters
language plpgsql
set search_path = public
as $function$
declare
  candidate public.characters;
  result_row public.characters;
begin
  select c.* into candidate
    from public.characters c
   where c.id = p_character_id
     and c.status = 'draft'
     and exists (
       select 1 from public.projects p
        where p.id = c.project_id
          and p.owner_id = (select auth.uid())
     );

  if candidate.id is null then
    raise exception 'CHARACTER_NOT_FOUND_OR_ALREADY_APPROVED'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.vision_locks vl where vl.project_id = candidate.project_id
  ) then
    raise exception 'VISION_LOCK_REVISION_REQUIRED'
      using errcode = '55000',
            detail = 'Create an explicit Vision Lock and Visual Plan revision before approving this character revision.';
  end if;

  update public.characters c
     set status = 'approved'
   where c.id = candidate.id
     and c.status = 'draft'
  returning c.* into result_row;
  return result_row;
end;
$function$;

create or replace function public.approve_environment(p_environment_id uuid)
returns public.environments
language plpgsql
set search_path = public
as $function$
declare
  candidate public.environments;
  result_row public.environments;
begin
  select e.* into candidate
    from public.environments e
   where e.id = p_environment_id
     and e.status = 'draft'
     and exists (
       select 1 from public.projects p
        where p.id = e.project_id
          and p.owner_id = (select auth.uid())
     );

  if candidate.id is null then
    raise exception 'ENVIRONMENT_NOT_FOUND_OR_ALREADY_APPROVED'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.vision_locks vl where vl.project_id = candidate.project_id
  ) then
    raise exception 'VISION_LOCK_REVISION_REQUIRED'
      using errcode = '55000',
            detail = 'Create an explicit Vision Lock and Visual Plan revision before approving this environment revision.';
  end if;

  update public.environments e
     set status = 'approved'
   where e.id = candidate.id
     and e.status = 'draft'
  returning e.* into result_row;
  return result_row;
end;
$function$;

-- Reconcile the production Vision Lock function into version control and make
-- sheet revisions snapshot only the latest approved leaf of each lineage.
create or replace function public.create_vision_lock(p_project_id uuid)
returns public.vision_locks
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_world public.world_reports;
  current_style public.style_bibles;
  current_song public.songs;
  next_revision integer;
  new_lock public.vision_locks;
  snapshot jsonb;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and p.owner_id = (select auth.uid())
  ) then
    raise exception 'VISION_LOCK_PROJECT_NOT_FOUND_OR_FORBIDDEN'
      using errcode = '42501';
  end if;

  select wr.* into current_world
    from public.projects p
    join public.world_reports wr on wr.id = p.world_report_id
   where p.id = p_project_id
     and p.world_confirmed_at is not null
     and wr.project_id = p.id
     and wr.status = 'completed'
     and wr.confirmed_at is not null;
  if current_world.id is null then
    raise exception 'VISION_LOCK_WORLD_NOT_CONFIRMED' using errcode = '23514';
  end if;

  select sb.* into current_style
    from public.style_bibles sb
   where sb.project_id = p_project_id
     and sb.world_report_id = current_world.id
     and sb.status = 'approved'
     and sb.approved_at is not null
   order by sb.created_at desc limit 1;
  if current_style.id is null then
    raise exception 'VISION_LOCK_STYLE_NOT_APPROVED' using errcode = '23514';
  end if;

  select s.* into current_song
    from public.songs s
   where s.project_id = p_project_id
     and s.analysis_status = 'completed'
   order by s.created_at desc limit 1;
  if current_song.id is null then
    raise exception 'VISION_LOCK_SONG_NOT_ANALYZED' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.characters c
     where c.project_id = p_project_id
       and c.world_report_id = current_world.id
       and c.style_bible_id = current_style.id
       and c.status <> 'approved'
  ) then
    raise exception 'VISION_LOCK_CHARACTERS_NOT_APPROVED' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.environments e
     where e.project_id = p_project_id
       and e.world_report_id = current_world.id
       and e.style_bible_id = current_style.id
       and e.status <> 'approved'
  ) then
    raise exception 'VISION_LOCK_ENVIRONMENTS_NOT_APPROVED' using errcode = '23514';
  end if;

  select coalesce(max(vl.revision_number), 0) + 1 into next_revision
    from public.vision_locks vl where vl.project_id = p_project_id;

  select jsonb_build_object(
    'schema_version', 2,
    'project', jsonb_build_object('id', p.id, 'title', p.title),
    'song', to_jsonb(current_song),
    'world', to_jsonb(current_world),
    'style_bible', to_jsonb(current_style),
    'characters', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at, c.id)
      from public.characters c
      where c.project_id = p_project_id
        and c.world_report_id = current_world.id
        and c.style_bible_id = current_style.id
        and c.status = 'approved'
        and not exists (
          select 1 from public.characters newer
           where newer.supersedes_character_id = c.id
             and newer.status = 'approved'
        )
    ), '[]'::jsonb),
    'character_assets', coalesce((
      select jsonb_agg(to_jsonb(ca) order by ca.created_at, ca.id)
      from public.character_assets ca
      join public.characters c on c.id = ca.character_id
      where ca.project_id = p_project_id
        and ca.world_report_id = current_world.id
        and c.style_bible_id = current_style.id
        and ca.status = 'approved'
    ), '[]'::jsonb),
    'environments', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.environments e
      where e.project_id = p_project_id
        and e.world_report_id = current_world.id
        and e.style_bible_id = current_style.id
        and e.status = 'approved'
        and not exists (
          select 1 from public.environments newer
           where newer.supersedes_environment_id = e.id
             and newer.status = 'approved'
        )
    ), '[]'::jsonb),
    'environment_assets', coalesce((
      select jsonb_agg(to_jsonb(ea) order by ea.created_at, ea.id)
      from public.environment_assets ea
      join public.environments e on e.id = ea.environment_id
      where ea.project_id = p_project_id
        and ea.world_report_id = current_world.id
        and e.style_bible_id = current_style.id
        and ea.status = 'approved'
    ), '[]'::jsonb)
  ) into snapshot
  from public.projects p where p.id = p_project_id;

  insert into public.vision_locks (
    project_id, world_report_id, style_bible_id, song_id,
    revision_number, snapshot
  ) values (
    p_project_id, current_world.id, current_style.id, current_song.id,
    next_revision, snapshot
  ) returning * into new_lock;
  return new_lock;
end;
$function$;
