-- Existing content stays in place. Only its access boundary changes.
-- The fixed-purpose counter RPC may increment only the verified caller's window;
-- client table writes must not permit resetting or forging that counter.
create or replace function public.consume_beatvision_arena_rate_limit()
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_user_id uuid := auth.uid();
 v_window_start timestamptz;
 v_count integer;
begin
 if v_user_id is null then return false; end if;
 v_window_start:=to_timestamp(floor(extract(epoch from now())/60)*60);
 insert into public.beatvision_arena_rate_limits(user_id,window_start,request_count)
 values(v_user_id,v_window_start,1)
 on conflict(user_id,window_start) do update
 set request_count=public.beatvision_arena_rate_limits.request_count+1
 returning request_count into v_count;
 delete from public.beatvision_arena_rate_limits
 where user_id=v_user_id and window_start<v_window_start-interval '2 minutes';
 return v_count<=30;
end $$;
revoke all on function public.consume_beatvision_arena_rate_limit() from public,anon;
grant execute on function public.consume_beatvision_arena_rate_limit() to authenticated;
revoke insert,update,delete,truncate,references,trigger on public.beatvision_arena_rate_limits from public,anon,authenticated;
drop policy if exists arena_rate_limits_insert_own on public.beatvision_arena_rate_limits;
drop policy if exists arena_rate_limits_update_own on public.beatvision_arena_rate_limits;
drop policy if exists arena_rate_limits_delete_own on public.beatvision_arena_rate_limits;
-- The variant endpoint already checks ownership; anonymous execution is unnecessary.
revoke all on function public.enqueue_scene_image_variant(uuid,uuid,uuid) from public,anon;
grant execute on function public.enqueue_scene_image_variant(uuid,uuid,uuid) to authenticated;
-- All existing legacy objects have valid owner_id metadata. Current canonical
-- imagery uses private visual-assets, not either legacy bucket's public URL.
drop policy if exists "BeatVision public read scene images" on storage.objects;
drop policy if exists "BeatVision authenticated read non-song storage" on storage.objects;
create policy legacy_storage_owner_select on storage.objects for select to authenticated
using(bucket_id in ('scene-images','render-manifests') and owner_id=(select auth.uid())::text);
update storage.buckets set public=false where id in ('scene-images','render-manifests');
