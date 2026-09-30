create table if not exists public.style_bibles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  world_basis jsonb not null default '{}'::jsonb,
  visual_language jsonb not null default '{}'::jsonb,
  cinematography jsonb not null default '{}'::jsonb,
  color_lighting jsonb not null default '{}'::jsonb,
  atmosphere jsonb not null default '{}'::jsonb,
  movement jsonb not null default '{}'::jsonb,
  continuity_rules jsonb not null default '[]'::jsonb,
  visual_rules jsonb not null default '[]'::jsonb,
  reference_assets jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint style_bibles_project_unique unique (project_id)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  style_bible_id uuid not null references public.style_bibles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  sheet jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null default 'reference',
  label text not null,
  storage_path text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  supersedes_asset_id uuid references public.character_assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.environments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  style_bible_id uuid not null references public.style_bibles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  status text not null default 'draft' check (status in ('draft', 'approved')),
  sheet jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.environment_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  world_report_id uuid not null references public.world_reports(id) on delete restrict,
  environment_id uuid not null references public.environments(id) on delete cascade,
  kind text not null default 'reference',
  label text not null,
  storage_path text not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  metadata jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  supersedes_asset_id uuid references public.environment_assets(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists style_bibles_world_report_idx on public.style_bibles(world_report_id);
create index if not exists characters_project_idx on public.characters(project_id);
create index if not exists characters_world_report_idx on public.characters(world_report_id);
create index if not exists characters_style_bible_idx on public.characters(style_bible_id);
create index if not exists character_assets_character_idx on public.character_assets(character_id);
create index if not exists character_assets_project_idx on public.character_assets(project_id);
create index if not exists environments_project_idx on public.environments(project_id);
create index if not exists environments_world_report_idx on public.environments(world_report_id);
create index if not exists environments_style_bible_idx on public.environments(style_bible_id);
create index if not exists environment_assets_environment_idx on public.environment_assets(environment_id);
create index if not exists environment_assets_project_idx on public.environment_assets(project_id);

create or replace function public.require_confirmed_world_reference()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.world_reports wr
    where wr.id = new.world_report_id
      and wr.project_id = new.project_id
      and wr.status = 'completed'
      and wr.confirmed_at is not null
  ) then
    raise exception 'WORLD_NOT_CONFIRMED'
      using errcode = '23514',
            detail = 'Phase 3 records require the confirmed Visual World Report.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_style_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  style_world_report uuid;
begin
  select sb.world_report_id
    into style_world_report
    from public.style_bibles sb
   where sb.id = new.style_bible_id
     and sb.project_id = new.project_id;

  if style_world_report is null or style_world_report <> new.world_report_id then
    raise exception 'STYLE_WORLD_LINEAGE_MISMATCH'
      using errcode = '23514',
            detail = 'Character/environment must use the Style Bible bound to the same confirmed World Report.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_character_asset_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.characters c
     where c.id = new.character_id
       and c.project_id = new.project_id
       and c.world_report_id = new.world_report_id
  ) then
    raise exception 'CHARACTER_ASSET_LINEAGE_MISMATCH'
      using errcode = '23514',
            detail = 'Character assets must reference the same project and confirmed World Report as their character.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_environment_asset_lineage()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.environments e
     where e.id = new.environment_id
       and e.project_id = new.project_id
       and e.world_report_id = new.world_report_id
  ) then
    raise exception 'ENVIRONMENT_ASSET_LINEAGE_MISMATCH'
      using errcode = '23514',
            detail = 'Environment assets must reference the same project and confirmed World Report as their environment.';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_phase3_lineage_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'style_bibles' then
    if new.project_id <> old.project_id or new.world_report_id <> old.world_report_id then
      raise exception 'STYLE_BIBLE_LINEAGE_IMMUTABLE' using errcode = '23514';
    end if;
  elsif tg_table_name = 'characters' then
    if new.project_id <> old.project_id
       or new.world_report_id <> old.world_report_id
       or new.style_bible_id <> old.style_bible_id then
      raise exception 'CHARACTER_LINEAGE_IMMUTABLE' using errcode = '23514';
    end if;
  elsif tg_table_name = 'environments' then
    if new.project_id <> old.project_id
       or new.world_report_id <> old.world_report_id
       or new.style_bible_id <> old.style_bible_id then
      raise exception 'ENVIRONMENT_LINEAGE_IMMUTABLE' using errcode = '23514';
    end if;
  elsif tg_table_name = 'character_assets' then
    if new.project_id <> old.project_id
       or new.world_report_id <> old.world_report_id
       or new.character_id <> old.character_id
       or new.storage_path <> old.storage_path then
      raise exception 'CHARACTER_ASSET_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
  elsif tg_table_name = 'environment_assets' then
    if new.project_id <> old.project_id
       or new.world_report_id <> old.world_report_id
       or new.environment_id <> old.environment_id
       or new.storage_path <> old.storage_path then
      raise exception 'ENVIRONMENT_ASSET_IDENTITY_IMMUTABLE' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_approved_asset_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'approved' then
    raise exception 'APPROVED_ASSET_IMMUTABLE'
      using errcode = '23514',
            detail = 'Approved Phase 3 assets cannot be deleted.';
  end if;
  return old;
end;
$$;

drop trigger if exists style_bibles_require_world on public.style_bibles;
create trigger style_bibles_require_world
before insert or update on public.style_bibles
for each row execute function public.require_confirmed_world_reference();

drop trigger if exists style_bibles_lineage_guard on public.style_bibles;
create trigger style_bibles_lineage_guard
before update on public.style_bibles
for each row execute function public.prevent_phase3_lineage_change();

drop trigger if exists characters_require_world on public.characters;
create trigger characters_require_world
before insert or update on public.characters
for each row execute function public.require_confirmed_world_reference();

drop trigger if exists characters_style_lineage on public.characters;
create trigger characters_style_lineage
before insert or update on public.characters
for each row execute function public.enforce_style_lineage();

drop trigger if exists characters_lineage_guard on public.characters;
create trigger characters_lineage_guard
before update on public.characters
for each row execute function public.prevent_phase3_lineage_change();

drop trigger if exists character_assets_require_world on public.character_assets;
create trigger character_assets_require_world
before insert or update on public.character_assets
for each row execute function public.require_confirmed_world_reference();

drop trigger if exists character_assets_lineage on public.character_assets;
create trigger character_assets_lineage
before insert or update on public.character_assets
for each row execute function public.enforce_character_asset_lineage();

drop trigger if exists character_assets_lineage_guard on public.character_assets;
create trigger character_assets_lineage_guard
before update on public.character_assets
for each row execute function public.prevent_phase3_lineage_change();

drop trigger if exists character_assets_approved_delete_guard on public.character_assets;
create trigger character_assets_approved_delete_guard
before delete on public.character_assets
for each row execute function public.prevent_approved_asset_delete();

drop trigger if exists environments_require_world on public.environments;
create trigger environments_require_world
before insert or update on public.environments
for each row execute function public.require_confirmed_world_reference();

drop trigger if exists environments_style_lineage on public.environments;
create trigger environments_style_lineage
before insert or update on public.environments
for each row execute function public.enforce_style_lineage();

drop trigger if exists environments_lineage_guard on public.environments;
create trigger environments_lineage_guard
before update on public.environments
for each row execute function public.prevent_phase3_lineage_change();

drop trigger if exists environment_assets_require_world on public.environment_assets;
create trigger environment_assets_require_world
before insert or update on public.environment_assets
for each row execute function public.require_confirmed_world_reference();

drop trigger if exists environment_assets_lineage on public.environment_assets;
create trigger environment_assets_lineage
before insert or update on public.environment_assets
for each row execute function public.enforce_environment_asset_lineage();

drop trigger if exists environment_assets_lineage_guard on public.environment_assets;
create trigger environment_assets_lineage_guard
before update on public.environment_assets
for each row execute function public.prevent_phase3_lineage_change();

drop trigger if exists environment_assets_approved_delete_guard on public.environment_assets;
create trigger environment_assets_approved_delete_guard
before delete on public.environment_assets
for each row execute function public.prevent_approved_asset_delete();

drop trigger if exists style_bibles_set_updated_at on public.style_bibles;
create trigger style_bibles_set_updated_at
before update on public.style_bibles
for each row execute function public.set_updated_at();

drop trigger if exists characters_set_updated_at on public.characters;
create trigger characters_set_updated_at
before update on public.characters
for each row execute function public.set_updated_at();

drop trigger if exists environments_set_updated_at on public.environments;
create trigger environments_set_updated_at
before update on public.environments
for each row execute function public.set_updated_at();

alter table public.style_bibles enable row level security;
alter table public.characters enable row level security;
alter table public.character_assets enable row level security;
alter table public.environments enable row level security;
alter table public.environment_assets enable row level security;

revoke all on table public.style_bibles from anon, authenticated;
revoke all on table public.characters from anon, authenticated;
revoke all on table public.character_assets from anon, authenticated;
revoke all on table public.environments from anon, authenticated;
revoke all on table public.environment_assets from anon, authenticated;

grant select, insert, update on table public.style_bibles to authenticated;
grant select, insert, update on table public.characters to authenticated;
grant select, insert, update on table public.character_assets to authenticated;
grant select, insert, update on table public.environments to authenticated;
grant select, insert, update on table public.environment_assets to authenticated;

drop policy if exists "style_bibles_owner_select" on public.style_bibles;
create policy "style_bibles_owner_select" on public.style_bibles
for select to authenticated
using (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.user_id = (select auth.uid())));

drop policy if exists "style_bibles_owner_insert" on public.style_bibles;
create policy "style_bibles_owner_insert" on public.style_bibles
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.user_id = (select auth.uid())));

drop policy if exists "style_bibles_owner_update" on public.style_bibles;
create policy "style_bibles_owner_update" on public.style_bibles
for update to authenticated
using (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = style_bibles.project_id and p.user_id = (select auth.uid())));

drop policy if exists "characters_owner_select" on public.characters;
create policy "characters_owner_select" on public.characters
for select to authenticated
using (exists (select 1 from public.projects p where p.id = characters.project_id and p.user_id = (select auth.uid())));

drop policy if exists "characters_owner_insert" on public.characters;
create policy "characters_owner_insert" on public.characters
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = characters.project_id and p.user_id = (select auth.uid())));

drop policy if exists "characters_owner_update" on public.characters;
create policy "characters_owner_update" on public.characters
for update to authenticated
using (exists (select 1 from public.projects p where p.id = characters.project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = characters.project_id and p.user_id = (select auth.uid())));

drop policy if exists "character_assets_owner_select" on public.character_assets;
create policy "character_assets_owner_select" on public.character_assets
for select to authenticated
using (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.user_id = (select auth.uid())));

drop policy if exists "character_assets_owner_insert" on public.character_assets;
create policy "character_assets_owner_insert" on public.character_assets
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.user_id = (select auth.uid())));

drop policy if exists "character_assets_owner_update" on public.character_assets;
create policy "character_assets_owner_update" on public.character_assets
for update to authenticated
using (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = character_assets.project_id and p.user_id = (select auth.uid())));

drop policy if exists "environments_owner_select" on public.environments;
create policy "environments_owner_select" on public.environments
for select to authenticated
using (exists (select 1 from public.projects p where p.id = environments.project_id and p.user_id = (select auth.uid())));

drop policy if exists "environments_owner_insert" on public.environments;
create policy "environments_owner_insert" on public.environments
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = environments.project_id and p.user_id = (select auth.uid())));

drop policy if exists "environments_owner_update" on public.environments;
create policy "environments_owner_update" on public.environments
for update to authenticated
using (exists (select 1 from public.projects p where p.id = environments.project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = environments.project_id and p.user_id = (select auth.uid())));

drop policy if exists "environment_assets_owner_select" on public.environment_assets;
create policy "environment_assets_owner_select" on public.environment_assets
for select to authenticated
using (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.user_id = (select auth.uid())));

drop policy if exists "environment_assets_owner_insert" on public.environment_assets;
create policy "environment_assets_owner_insert" on public.environment_assets
for insert to authenticated
with check (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.user_id = (select auth.uid())));

drop policy if exists "environment_assets_owner_update" on public.environment_assets;
create policy "environment_assets_owner_update" on public.environment_assets
for update to authenticated
using (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.projects p where p.id = environment_assets.project_id and p.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public)
values ('visual-assets', 'visual-assets', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "visual_assets_owner_select" on storage.objects;
create policy "visual_assets_owner_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'visual-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "visual_assets_owner_insert" on storage.objects;
create policy "visual_assets_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'visual-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "visual_assets_owner_update" on storage.objects;
create policy "visual_assets_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'visual-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'visual-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

