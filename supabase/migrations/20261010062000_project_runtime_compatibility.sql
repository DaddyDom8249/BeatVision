-- Bridge the repository's legacy fresh-install project/song shape to the
-- existing application API. Preserve all rows and production enum ownership.
alter table public.projects add column if not exists stage text not null default 'song';
do $compat$
begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='user_id') then
    execute 'alter table public.projects alter column user_id set default auth.uid()';
    -- Keep legacy dependent owner policies aligned with canonical owner_id.
    execute $ddl$
      create or replace function public.sync_legacy_project_owner()
      returns trigger language plpgsql set search_path=public as $body$
      begin new.user_id:=new.owner_id; return new; end;
      $body$;
    $ddl$;
    execute 'drop trigger if exists projects_sync_legacy_owner on public.projects';
    execute 'create trigger projects_sync_legacy_owner before insert or update of owner_id,user_id on public.projects for each row execute function public.sync_legacy_project_owner()';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='status' and data_type='text') then
    alter table public.projects drop constraint if exists projects_status_check;
    alter table public.projects alter column status set default 'Draft';
    alter table public.projects add constraint projects_status_check check(status in (
      'draft','active','Draft','World Approved','Storyboard Approved','Ready for Generation',
      'Ready for Motion','Motion Plans Approved','Preview Render Ready','Final Render Ready',
      'Render Failed','World Revealed','Generating World Assets','World Assets Approved',
      'Generating Scene Images','Scene Images In Review','Scene Images Approved',
      'Ready for Image Generation','Ready for Video Generation','Generating Motion',
      'Preview Ready','Export Ready','Motion In Review','Motion Approved','Motion Settings Ready',
      'Motion Plan Ready','Motion Clips In Review','Motion Clips Approved','Final Video Rendered'
    ));
  end if;
end;
$compat$;
