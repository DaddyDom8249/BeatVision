-- Song Intake stores the artist's optional visual direction separately from
-- their notes. Add this column as a forward-only, non-destructive upgrade.
-- Production migration ledger must be reconciled before rollout.
alter table public.songs
  add column if not exists visual_style_preferences jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='songs'
      and column_name='visual_style_preferences' and data_type <> 'jsonb'
  ) then
    raise exception 'SONG_VISUAL_STYLE_PREFERENCES_TYPE_MISMATCH';
  end if;
end $$;
