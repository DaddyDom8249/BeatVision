-- BragoraForge Song Intelligence.
--
-- Interpretation is a creator-controlled, versioned input to World Reveal.
-- Audio identity is written only by the server-side fingerprint RPC; browser
-- clients can read the resulting lineage but cannot forge it.

begin;

alter table public.songs
  add column if not exists audio_source_fingerprint text,
  add column if not exists audio_source_fingerprint_algorithm text not null default 'sha256',
  add column if not exists audio_source_size bigint,
  add column if not exists audio_source_fingerprinted_at timestamptz,
  add column if not exists current_interpretation_id uuid,
  add column if not exists interpretation_confirmed_at timestamptz;

create table if not exists public.song_interpretations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  audio_revision uuid not null,
  source_fingerprint text not null,
  source_fingerprint_algorithm text not null default 'sha256',
  version integer not null check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'superseded')),
  source_type text not null
    check (source_type in ('ai', 'manual', 'artist_edited')),
  interpretation jsonb not null,
  evidence jsonb not null default '[]'::jsonb,
  provider text,
  model text,
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_interpretations_fingerprint_format
    check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint song_interpretations_evidence_array
    check (jsonb_typeof(evidence) = 'array'),
  constraint song_interpretations_object
    check (jsonb_typeof(interpretation) = 'object'),
  constraint song_interpretations_song_version_unique
    unique (song_id, version)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'songs_current_interpretation_fk'
      and conrelid = 'public.songs'::regclass
  ) then
    alter table public.songs
      add constraint songs_current_interpretation_fk
      foreign key (current_interpretation_id)
      references public.song_interpretations(id)
      on delete restrict;
  end if;
end;
$$;

create table if not exists public.song_interpretation_audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  interpretation_id uuid references public.song_interpretations(id) on delete restrict,
  event_type text not null check (event_type in (
    'source_fingerprinted',
    'draft_created',
    'draft_superseded',
    'confirmed'
  )),
  actor_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists song_interpretations_song_version_idx
  on public.song_interpretations(song_id, version desc);
create index if not exists song_interpretations_project_idx
  on public.song_interpretations(project_id, created_at desc);
create index if not exists song_interpretation_audit_song_idx
  on public.song_interpretation_audit_events(song_id, created_at desc);

-- The Edge Functions use the server-side service role for the owner-checked
-- RPC boundary and for read-only audit/history queries.
grant all on public.song_interpretations, public.song_interpretation_audit_events
  to service_role;

alter table public.song_interpretations enable row level security;
alter table public.song_interpretation_audit_events enable row level security;

revoke all on public.song_interpretations from anon, authenticated;
grant select on public.song_interpretations to authenticated;
drop policy if exists song_interpretations_owner_select on public.song_interpretations;
create policy song_interpretations_owner_select
  on public.song_interpretations for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = song_interpretations.project_id
      and p.owner_id = (select auth.uid())
  ));

revoke all on public.song_interpretation_audit_events from anon, authenticated;
grant select on public.song_interpretation_audit_events to authenticated;
drop policy if exists song_interpretation_audit_owner_select on public.song_interpretation_audit_events;
create policy song_interpretation_audit_owner_select
  on public.song_interpretation_audit_events for select to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = song_interpretation_audit_events.project_id
      and p.owner_id = (select auth.uid())
  ));

create or replace function public.prevent_song_interpretation_audit_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'SONG_INTERPRETATION_AUDIT_IMMUTABLE' using errcode = '55000';
end;
$$;

drop trigger if exists song_interpretation_audit_immutable
  on public.song_interpretation_audit_events;
create trigger song_interpretation_audit_immutable
before update or delete on public.song_interpretation_audit_events
for each row execute function public.prevent_song_interpretation_audit_mutation();

create or replace function public.reset_song_interpretation_on_audio_change()
returns trigger language plpgsql set search_path = public as $$
begin
  -- A browser-supplied fingerprint is never accepted. A new audio path must
  -- be fingerprinted again before any interpretation can be confirmed.
  if tg_op = 'INSERT' then
    new.audio_source_fingerprint = null;
    new.audio_source_size = null;
    new.audio_source_fingerprinted_at = null;
    new.current_interpretation_id = null;
    new.interpretation_confirmed_at = null;
  elsif new.audio_path is distinct from old.audio_path
     or new.audio_revision is distinct from old.audio_revision then
    new.audio_source_fingerprint = null;
    new.audio_source_size = null;
    new.audio_source_fingerprinted_at = null;
    new.current_interpretation_id = null;
    new.interpretation_confirmed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists songs_interpretation_audio_guard on public.songs;
create trigger songs_interpretation_audio_guard
before insert or update of audio_path, audio_revision on public.songs
for each row execute function public.reset_song_interpretation_on_audio_change();

-- Existing column grants are intentionally narrow. Make the new authority
-- fields explicitly unreadable to direct browser writes even if a future
-- migration broadens table-level privileges.
revoke insert (audio_source_fingerprint, audio_source_fingerprint_algorithm,
  audio_source_size, audio_source_fingerprinted_at, current_interpretation_id,
  interpretation_confirmed_at) on public.songs from anon, authenticated;
revoke update (audio_source_fingerprint, audio_source_fingerprint_algorithm,
  audio_source_size, audio_source_fingerprinted_at, current_interpretation_id,
  interpretation_confirmed_at) on public.songs from anon, authenticated;

create or replace function public.record_song_source_fingerprint(
  p_project_id uuid,
  p_song_id uuid,
  p_actor_id uuid,
  p_audio_revision uuid,
  p_source_fingerprint text,
  p_byte_length bigint
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
begin
  if p_actor_id is null or not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_actor_id
  ) then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_source_fingerprint is null
     or p_source_fingerprint !~ '^[0-9a-f]{64}$'
     or p_byte_length is null or p_byte_length <= 0 then
    raise exception 'SONG_SOURCE_FINGERPRINT_INVALID' using errcode = '23514';
  end if;

  select * into song_row
    from public.songs
   where id = p_song_id and project_id = p_project_id
   for update;
  if song_row.id is null or song_row.audio_path is null then
    raise exception 'SONG_AUDIO_REQUIRED' using errcode = '23514';
  end if;
  if song_row.audio_revision is distinct from p_audio_revision then
    raise exception 'SONG_AUDIO_REVISION_CHANGED' using errcode = '40001';
  end if;
  if song_row.audio_source_fingerprint is not null
     and song_row.audio_source_fingerprint is distinct from lower(p_source_fingerprint) then
    raise exception 'SONG_SOURCE_FINGERPRINT_CONFLICT' using errcode = '40001';
  end if;

  update public.songs
     set audio_source_fingerprint = lower(p_source_fingerprint),
         audio_source_fingerprint_algorithm = 'sha256',
         audio_source_size = p_byte_length,
         audio_source_fingerprinted_at = now()
   where id = p_song_id and project_id = p_project_id;

  insert into public.song_interpretation_audit_events
    (project_id, song_id, event_type, actor_id, details)
  values
    (p_project_id, p_song_id, 'source_fingerprinted', p_actor_id,
     jsonb_build_object('audio_revision', p_audio_revision,
                        'source_fingerprint', lower(p_source_fingerprint),
                        'byte_length', p_byte_length)) ;
  return true;
end;
$$;

create or replace function public.save_song_interpretation_draft(
  p_project_id uuid,
  p_song_id uuid,
  p_actor_id uuid,
  p_audio_revision uuid,
  p_source_fingerprint text,
  p_interpretation jsonb,
  p_evidence jsonb,
  p_source_type text,
  p_provider text,
  p_model text,
  p_provenance jsonb
) returns public.song_interpretations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
  previous public.song_interpretations;
  draft public.song_interpretations;
  next_version integer;
begin
  if p_actor_id is null or not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_actor_id
  ) then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  if p_source_type not in ('ai', 'manual', 'artist_edited') then
    raise exception 'SONG_INTERPRETATION_SOURCE_INVALID' using errcode = '23514';
  end if;
  if p_interpretation is null or jsonb_typeof(p_interpretation) <> 'object'
     or octet_length(p_interpretation::text) > 131072 then
    raise exception 'SONG_INTERPRETATION_INVALID' using errcode = '23514';
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence) <> 'array'
     or octet_length(p_evidence::text) > 131072 then
    raise exception 'SONG_INTERPRETATION_EVIDENCE_INVALID' using errcode = '23514';
  end if;

  select * into song_row
    from public.songs
   where id = p_song_id and project_id = p_project_id
   for update;
  if song_row.id is null or song_row.audio_path is null then
    raise exception 'SONG_AUDIO_REQUIRED' using errcode = '23514';
  end if;
  if song_row.audio_revision is distinct from p_audio_revision
     or song_row.audio_source_fingerprint is distinct from lower(p_source_fingerprint) then
    raise exception 'SONG_INTERPRETATION_SOURCE_STALE' using errcode = '40901';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
    from public.song_interpretations
   where song_id = p_song_id;

  -- Draft content is immutable. A subsequent save appends a new version and
  -- leaves confirmed history available for audit and lineage inspection. Each
  -- superseded draft receives its own append-only audit event.
  for previous in
    select * from public.song_interpretations
     where song_id = p_song_id and status = 'draft'
     for update
  loop
    update public.song_interpretations
       set status = 'superseded', updated_at = now()
     where id = previous.id;
    insert into public.song_interpretation_audit_events
      (project_id, song_id, interpretation_id, event_type, actor_id, details)
    values
      (p_project_id, p_song_id, previous.id, 'draft_superseded', p_actor_id,
       jsonb_build_object('version', previous.version));
  end loop;

  insert into public.song_interpretations (
    project_id, song_id, audio_revision, source_fingerprint, version, status,
    source_type, interpretation, evidence, provider, model, provenance,
    created_by
  ) values (
    p_project_id, p_song_id, p_audio_revision, lower(p_source_fingerprint),
    next_version, 'draft', p_source_type, p_interpretation, p_evidence,
    nullif(p_provider, ''), nullif(p_model, ''), coalesce(p_provenance, '{}'::jsonb),
    p_actor_id
  ) returning * into draft;

  insert into public.song_interpretation_audit_events
    (project_id, song_id, interpretation_id, event_type, actor_id, details)
  values
    (p_project_id, p_song_id, draft.id, 'draft_created', p_actor_id,
     jsonb_build_object('version', draft.version, 'source_type', p_source_type,
                        'source_fingerprint', lower(p_source_fingerprint)));

  return draft;
end;
$$;

create or replace function public.confirm_song_interpretation(
  p_project_id uuid,
  p_song_id uuid,
  p_interpretation_id uuid,
  p_actor_id uuid
) returns public.song_interpretations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
  candidate public.song_interpretations;
  confirmed public.song_interpretations;
begin
  if p_actor_id is null or not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.owner_id = p_actor_id
  ) then
    raise exception 'SONG_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
  select * into song_row from public.songs
   where id = p_song_id and project_id = p_project_id for update;
  select * into candidate from public.song_interpretations
   where id = p_interpretation_id and song_id = p_song_id and project_id = p_project_id
   for update;
  if candidate.id is null then
    raise exception 'SONG_INTERPRETATION_NOT_FOUND' using errcode = '40401';
  end if;
  if candidate.status not in ('draft', 'confirmed') then
    raise exception 'SONG_INTERPRETATION_NOT_CONFIRMABLE' using errcode = '40901';
  end if;
  if song_row.audio_revision is distinct from candidate.audio_revision
     or song_row.audio_source_fingerprint is distinct from candidate.source_fingerprint then
    raise exception 'SONG_INTERPRETATION_SOURCE_STALE' using errcode = '40901';
  end if;

  update public.song_interpretations
     set status = 'superseded', updated_at = now()
   where song_id = p_song_id and status = 'confirmed' and id <> candidate.id;
  update public.song_interpretations
     set status = 'confirmed', confirmed_by = p_actor_id,
         confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
   where id = candidate.id
   returning * into confirmed;
  update public.songs
     set current_interpretation_id = confirmed.id,
         interpretation_confirmed_at = confirmed.confirmed_at
   where id = p_song_id and project_id = p_project_id;

  insert into public.song_interpretation_audit_events
    (project_id, song_id, interpretation_id, event_type, actor_id, details)
  values
    (p_project_id, p_song_id, confirmed.id, 'confirmed', p_actor_id,
     jsonb_build_object('version', confirmed.version,
                        'source_fingerprint', confirmed.source_fingerprint));
  return confirmed;
end;
$$;

revoke all on function public.record_song_source_fingerprint(uuid,uuid,uuid,uuid,text,bigint)
  from public, anon, authenticated;
grant execute on function public.record_song_source_fingerprint(uuid,uuid,uuid,uuid,text,bigint)
  to service_role;
revoke all on function public.save_song_interpretation_draft(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.save_song_interpretation_draft(uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,jsonb)
  to service_role;
revoke all on function public.confirm_song_interpretation(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_song_interpretation(uuid,uuid,uuid,uuid)
  to service_role;

-- World reports keep the exact interpretation that supplied their creative
-- state. Null is retained for legacy worlds; new World generation writes it.
alter table public.world_reports
  add column if not exists interpretation_id uuid,
  add column if not exists interpretation_source_fingerprint text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'world_reports_interpretation_fk'
      and conrelid = 'public.world_reports'::regclass
  ) then
    alter table public.world_reports
      add constraint world_reports_interpretation_fk
      foreign key (interpretation_id)
      references public.song_interpretations(id)
      on delete restrict;
  end if;
end;
$$;

create index if not exists world_reports_interpretation_idx
  on public.world_reports(interpretation_id);

-- Any newly inserted Vision Lock must carry the confirmed interpretation when
-- the song has been fingerprinted. Legacy locks remain readable and usable by
-- their already-submitted jobs, but cannot be silently used for new work.
create or replace function public.enforce_new_vision_lock_interpretation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  song_row public.songs;
  interpretation_row public.song_interpretations;
  snapshot jsonb;
begin
  select * into song_row from public.songs where id = new.song_id and project_id = new.project_id;
  if song_row.audio_source_fingerprint is null then
    return new;
  end if;
  select * into interpretation_row from public.song_interpretations
   where id = song_row.current_interpretation_id and song_id = song_row.id
     and status = 'confirmed';
  if interpretation_row.id is null
     or interpretation_row.source_fingerprint is distinct from song_row.audio_source_fingerprint
     or interpretation_row.audio_revision is distinct from song_row.audio_revision then
    raise exception 'VISION_LOCK_INTERPRETATION_REQUIRED' using errcode = '23514';
  end if;
  snapshot := coalesce(new.snapshot, '{}'::jsonb);
  new.snapshot := snapshot || jsonb_build_object(
    'song_interpretation', to_jsonb(interpretation_row),
    'interpretation_lineage', jsonb_build_object(
      'interpretation_id', interpretation_row.id,
      'source_fingerprint', interpretation_row.source_fingerprint,
      'audio_revision', interpretation_row.audio_revision,
      'confirmed_at', interpretation_row.confirmed_at
    )
  );
  return new;
end;
$$;

drop trigger if exists vision_locks_interpretation_guard on public.vision_locks;
create trigger vision_locks_interpretation_guard
before insert on public.vision_locks
for each row execute function public.enforce_new_vision_lock_interpretation();

create or replace function public.reject_unlineaged_new_generation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare lock_snapshot jsonb;
begin
  if new.status = 'queued' and new.job_type in ('scene_image', 'scene_motion', 'assembly') then
    select snapshot into lock_snapshot from public.vision_locks where id = new.vision_lock_id;
    if coalesce(lock_snapshot -> 'interpretation_lineage' ->> 'interpretation_id', '') = '' then
      raise exception 'GENERATION_INTERPRETATION_LINEAGE_REQUIRED' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists generation_jobs_interpretation_guard on public.generation_jobs;
create trigger generation_jobs_interpretation_guard
before insert on public.generation_jobs
for each row execute function public.reject_unlineaged_new_generation();

commit;
