create schema if not exists private;

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists private.beatvision_generation_scheduler_config (
  id boolean primary key default true,
  queue_secret text not null default encode(gen_random_bytes(32), 'hex')
);

insert into private.beatvision_generation_scheduler_config(id)
values (true)
on conflict (id) do nothing;

revoke all on schema private from anon, authenticated;
revoke all on table private.beatvision_generation_scheduler_config from anon, authenticated;
grant usage on schema private to service_role;
grant select on table private.beatvision_generation_scheduler_config to service_role;

select cron.unschedule('beatvision-generation-drain')
where exists (
  select 1 from cron.job where jobname = 'beatvision-generation-drain'
);

select cron.schedule(
  'beatvision-generation-drain',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://mdofsinyofqbeapzfygu.supabase.co/functions/v1/beatvision-generation',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-BeatVision-Queue-Secret',
        (select queue_secret from private.beatvision_generation_scheduler_config where id = true)
      ),
      body := '{"action":"drain"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $cron$
);
