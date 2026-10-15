-- Fresh-install prerequisite recovered from production column/constraint metadata.
-- No existing final_videos table, data, grants or policies are modified.
do $baseline$
begin
  if to_regclass('public.final_videos') is null then
    create table public.final_videos (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.projects(id) on delete cascade,
      title text, video_url text, preview_video_url text, audio_file text,
      duration numeric(7,2), format text, quality text,
      render_status text not null default 'pending',
      downloadable boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      segment_count integer, render_manifest_url text
    );
    alter table public.final_videos enable row level security;
    create policy final_videos_owner_all on public.final_videos
      for all to authenticated
      using (exists(select 1 from public.projects p where p.id=final_videos.project_id and p.owner_id=(select auth.uid())))
      with check (exists(select 1 from public.projects p where p.id=final_videos.project_id and p.owner_id=(select auth.uid())));
    grant select,insert,update,delete on public.final_videos to authenticated;
    grant all on public.final_videos to service_role;
  end if;
end;
$baseline$;
