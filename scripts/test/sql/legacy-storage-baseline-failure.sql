-- Intentionally FAILS against the real legacy policy pattern.
-- The wrapping transaction is discarded after the expected exception.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $case$
begin
  update storage.objects set name = name || '.tampered'
    where bucket_id = 'scene-images'
      and name = '00000000-0000-0000-0000-000000000101/original.jpg';
  if found then
    raise exception 'LEGACY_CROSS_OWNER_UPDATE_POSSIBLE';
  end if;
  raise exception 'FIXTURE_DID_NOT_REPRODUCE';
end;
$case$;
rollback;
