-- World revisions: confirmed rows are immutable and every later change is a new row.

alter table public.world_reports
  add column if not exists world_id uuid default gen_random_uuid(),
  add column if not exists revision_number integer default 1;

update public.world_reports
set world_id = id
where world_id is null;

update public.world_reports
set revision_number = 1
where revision_number is null;

alter table public.world_reports
  alter column world_id set not null,
  alter column revision_number set not null;

alter table public.world_reports
  add constraint world_reports_revision_number_positive
  check (revision_number > 0);

create unique index if not exists world_reports_project_revision_uidx
  on public.world_reports (project_id, revision_number);

create unique index if not exists world_reports_world_revision_uidx
  on public.world_reports (world_id, revision_number);

create index if not exists world_reports_project_latest_idx
  on public.world_reports (project_id, revision_number desc);

create or replace function public.prevent_confirmed_world_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.confirmed_at is not null then
    raise exception using
      errcode = '55000',
      message = 'Confirmed World revisions are immutable; create a new revision instead.',
      detail = 'world_report_id=' || old.id::text || ', world_id=' || old.world_id::text || ', revision_number=' || old.revision_number::text;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists world_reports_confirmed_immutable on public.world_reports;
create trigger world_reports_confirmed_immutable
before update or delete on public.world_reports
for each row
execute function public.prevent_confirmed_world_mutation();

comment on column public.world_reports.world_id is 'Stable World lineage identifier shared by all revisions.';
comment on column public.world_reports.revision_number is 'Monotonic revision number within a project World lineage; revision 1 is the original World.';