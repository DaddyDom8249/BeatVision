-- Replay the four existing production songs storage policies in fresh databases.
-- Observed read-only in production on 2026-10-14.  Preserve their current
-- access semantics and names; do not drop/rewrite working production policies.
-- A future tightening of project ownership must be a separately tested change.
-- CREATE POLICY has no IF NOT EXISTS, so use catalog-guarded DDL for replay.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'BeatVision authenticated read own song audio'
  ) then
    create policy "BeatVision authenticated read own song audio"
      on storage.objects for select to authenticated
      using (bucket_id = 'songs' and name like ((select auth.uid())::text || '/%'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'BeatVision authenticated upload own song audio'
  ) then
    create policy "BeatVision authenticated upload own song audio"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'songs' and name like ((select auth.uid())::text || '/%'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'BeatVision authenticated update own song audio'
  ) then
    create policy "BeatVision authenticated update own song audio"
      on storage.objects for update to authenticated
      using (bucket_id = 'songs' and name like ((select auth.uid())::text || '/%'))
      with check (bucket_id = 'songs' and name like ((select auth.uid())::text || '/%'));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'BeatVision authenticated delete own song audio'
  ) then
    create policy "BeatVision authenticated delete own song audio"
      on storage.objects for delete to authenticated
      using (bucket_id = 'songs' and name like ((select auth.uid())::text || '/%'));
  end if;
end
$$;
