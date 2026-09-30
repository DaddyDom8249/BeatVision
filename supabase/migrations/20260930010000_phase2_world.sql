create table if not exists public.world_reports (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','completed','unavailable','failed')),
 mood jsonb, emotional_arc jsonb, visual_language jsonb, cinematography jsonb, environments jsonb,
 color_lighting jsonb, motifs jsonb, atmosphere jsonb, movement jsonb, continuity_rules jsonb,
 immutable_continuity jsonb, raw_report jsonb, provider text, provider_request_id text,
 error_code text, error_message text, confirmed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint world_reports_project_unique unique(project_id)
);
alter table public.projects add column if not exists world_report_id uuid;
alter table public.projects add column if not exists world_confirmed_at timestamptz;
create index if not exists world_reports_project_id_idx on public.world_reports(project_id);
alter table public.world_reports enable row level security;
drop policy if exists "world_reports_owner_select" on public.world_reports;
create policy "world_reports_owner_select" on public.world_reports for select using(exists(select 1 from public.projects p where p.id=world_reports.project_id and p.user_id=auth.uid()));
drop policy if exists "world_reports_owner_insert" on public.world_reports;
create policy "world_reports_owner_insert" on public.world_reports for insert with check(exists(select 1 from public.projects p where p.id=world_reports.project_id and p.user_id=auth.uid()));
drop policy if exists "world_reports_owner_update" on public.world_reports;
create policy "world_reports_owner_update" on public.world_reports for update using(exists(select 1 from public.projects p where p.id=world_reports.project_id and p.user_id=auth.uid())) with check(exists(select 1 from public.projects p where p.id=world_reports.project_id and p.user_id=auth.uid()));
drop trigger if exists world_reports_set_updated_at on public.world_reports;
create trigger world_reports_set_updated_at before update on public.world_reports for each row execute function public.set_updated_at();