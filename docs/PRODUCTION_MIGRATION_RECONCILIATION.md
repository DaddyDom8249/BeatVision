# BeatVision Production Migration Reconciliation

Date: 2026-10-04
Branch: cleanup/canonical-repository-purge
Production project: mdofsinyofqbeapzfygu

## Status

- VERIFIED: live Supabase migration history was read directly.
- VERIFIED: seven later production migrations were recovered exactly from the BeatVision `beatvision-1` branch and restored to this canonical cleanup branch.
- VERIFIED: recovered migration blob SHAs match the source branch byte-for-byte.
- BLOCKED: 37 older production migrations are present in live migration history but their authoritative SQL source was not found in the current BeatVision branches.
- UNSAFE: those 37 migrations are not being reconstructed from current schema state.
- NO PRODUCTION CHANGES: this reconciliation performed read-only production inspection only.

## Recovered exactly

- VERIFIED: `supabase/migrations/20261004000000_beatvision1_integrity_hardening.sql`
- VERIFIED: `supabase/migrations/20261004010000_vision_lock.sql`
- VERIFIED: `supabase/migrations/20261004020000_visual_plan_vision_lock_binding.sql`
- VERIFIED: `supabase/migrations/20261004030000_generation_jobs.sql`
- VERIFIED: `supabase/migrations/20261004050000_visual_plan_atomic_creation.sql`
- VERIFIED: `supabase/migrations/20261004060000_secure_vision_lock_rpc.sql`
- VERIFIED: `supabase/migrations/20261004120000_reconcile_projects_owner_id.sql`

## Live migrations whose authoritative source remains missing

- BLOCKED: `20260917133826` — `lock_down_trigger_function_execute_privileges`
- BLOCKED: `20260917133836` — `remove_public_trigger_function_execute_privileges`
- BLOCKED: `20260917133937` — `restore_runtime_motion_tables_without_data_loss`
- BLOCKED: `20260917154711` — `add_project_debug_trace_events`
- BLOCKED: `20260917154949` — `add_project_debug_trace_ingest`
- BLOCKED: `20260917161351` — `restore_beatvision_project_owner_execute_for_authenticated`
- BLOCKED: `20260917161433` — `restore_missing_phase4_and_project_change_tables`
- BLOCKED: `20260917235130` — `atomic_restore_motion_settings_and_plans`
- BLOCKED: `20260917235246` — `atomic_storyboard_replacement`
- BLOCKED: `20260918000051` — `atomic_reconcile_project_status_enum`
- BLOCKED: `20260918000150` — `atomic_reconcile_scene_prompt_review_state`
- BLOCKED: `20260918000220` — `atomic_reconcile_scene_image_generation_schema`
- BLOCKED: `20260918000303` — `atomic_reconcile_motion_plan_review_state`
- BLOCKED: `20260918001135` — `atomic_harden_storyboard_rpc`
- BLOCKED: `20260918061219` — `reconcile_authenticated_media_rls`
- BLOCKED: `20260918101639` — `fix_creative_match_score_numeric`
- BLOCKED: `20260920042903` — `add_failed_to_scene_images`
- BLOCKED: `20260920042920` — `reconcile_scene_images_failed_column`
- BLOCKED: `20260924031604` — `beatvision_project_aggregate_and_fk_indexes`
- BLOCKED: `20260924031821` — `beatvision_harden_rls_initplans`
- BLOCKED: `20260924031908` — `beatvision_normalize_rls_auth_uid_policies`
- BLOCKED: `20260924031915` — `beatvision_remove_duplicate_debug_trace_policies`
- BLOCKED: `20260924032026` — `beatvision_restore_creative_match_score_range`
- BLOCKED: `20260924035919` — `harden_generation_defaults_and_public_policies`
- BLOCKED: `20260924051131` — `generation_runs_idempotency`
- BLOCKED: `20260924053055` — `reconcile_motion_clip_runtime_columns`
- BLOCKED: `20260924053419` — `harden_generation_helper_function_grants`
- BLOCKED: `20260924064753` — `add_video_render_provider_id`
- BLOCKED: `20260926064517` — `reconcile_scene_visual_prompts_owner_id`
- BLOCKED: `20260926072101` — `reconcile_creative_match_score_percent_range`
- BLOCKED: `20260927051215` — `20260927053200_sync_scene_previews_from_scene_images_final`
- BLOCKED: `20260927172413` — `harden_project_authorization_and_trigger_function_grants`
- BLOCKED: `20260928025110` — `reconcile_final_videos_runtime_schema`
- BLOCKED: `20260928031245` — `add_storyboard_scene_number_uniqueness`
- BLOCKED: `20260928053717` — `20260928060000_add_arena_rate_limit`
- BLOCKED: `20260928053824` — `20260928061000_harden_arena_rate_limit_security`
- BLOCKED: `20260929190436` — `phase1_fix_song_trigger_search_path`

## Important interpretation

The live migration history is authoritative evidence of what was applied to production, but it is not a safe substitute for the original migration SQL. Current schema state can be used to design a future clean baseline, but it must not be used to fabricate historical migrations and pretend they were the original source.

## Next safe phase

Trace the canonical production generation path from the approved Visual Plan through generation_jobs → BeatVision generation controller → BeatVision Arena 2.0 bridge → Pixazo free image/video providers → durable Storage/DB outputs → Shotstack Sandbox assembly. Legacy runtime paths will be classified as active, transitional, or obsolete before deletion.
