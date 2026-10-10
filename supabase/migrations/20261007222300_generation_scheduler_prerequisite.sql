-- The scheduler-secret RPC is compiled before the scheduler migration.
-- Create only its prerequisite structure; the scheduler creates its secret later.
-- Existing production configuration and secrets are never replaced.
create schema if not exists private;
create table if not exists private.beatvision_generation_scheduler_config (
  id boolean primary key default true,
  queue_secret text not null default encode(gen_random_bytes(32), 'hex')
);
revoke all on schema private from anon, authenticated;
revoke all on table private.beatvision_generation_scheduler_config from anon, authenticated;
grant usage on schema private to service_role;
grant select on table private.beatvision_generation_scheduler_config to service_role;
