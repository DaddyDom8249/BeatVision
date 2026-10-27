# Founder end-to-end orchestration audit — 2026-10-27

Scope: source snapshot **8cc87e1** from PR #158, read-only Supabase production Edge versions, and preview deployment `dpl_DHJvXv5QDMEph1QjJeikPfCJ2aoQ`. This branch is **not deployed**.

## Confirmed stage inventory

1. Authenticated project/song intake: SongPage, useSong, beatvision-analyze-song and song-interpretation.
2. Song-confirmed world: WorldPage, beatvision-world; user must confirm.
3. World/Style Bible approvals: StylePage and beatvision-style-draft.
4. Visual plan and short shot revision: VisualPlanPage and useVisualPlan.
5. Whole-plan AI suggestions: AutomaticPlanHelp -> beatvision-ai-director -> owner-reviewed atomic RPC save.
6. Director's Studio: DirectorStoryboard; mobile user confirmed save/reload; original approvals remain read only.
7. Scene image + owner approval: ProductionWorkspacePage, BatchProductionPanel and scene_image_assets.
8. Real motion jobs + stored MP4: generation controller + Modal/HF, approved motion_clip_assets.
9. Final assembly: enqueue_assembly_generation + stored measured clip duration and provenance; no Glass Love final_video row in production during audit.

## P1: Preview origin gate (verified)

The deployed **beatvision-generation v72** code and source for beatvision-ai-director, world, analyze-song, song-interpretation and style-draft do not allow the temporary PR #158 preview origin. Some send a fixed production allow-origin header to other callers; browsers still reject them. Scene edits save through owner-scoped Supabase RPC and do not prove the AI function calls work.

This branch adds `trustedStudioOrigin`, a shared fail-closed exact-origin check. After release parity review, operators may explicitly admit `https://beat-vision-kfk4sh067-beat-vision.vercel.app` using the server-only Edge variable `BEATVISION_ALLOWED_PREVIEW_ORIGINS`. Alias `https://beat-vision-git-feat-director-storyboard-rev-8fbf97-beat-vision.vercel.app` is also eligible if separately listed. This must NOT be a client variable. Never authorize arbitrary `*.vercel.app`.

## Release block — production Edge drift

- Production `beatvision-generation` version 72 hash `00b8bf05ce195737281d0a8b6aee4b32692c364d0f12bfadf1d803b8128dcf87` is not an exact copy of this branch's function.
- Blind redeployment would overwrite uncommitted live changes and is **prohibited**.
- Reconcile deployed function source, active dependencies and migrations before a reviewed Edge release. Running PR CI alone cannot verify preview calls to the still-deployed function.

## Sponsor demo gates still open

- Authenticated owner full route: freshly uploaded song -> confirmed interpretation -> world/style -> auto storyboard -> lock -> image -> approval -> motion -> playable MP4. Prior owner save/reload test covers only the storyboard.
- Provider credit/billing approval and a bounded test render must be confirmed before inference.
- Glass Love had 14 stored MP4 clips with 9 approved at audit, but full-song final assembly was absent. Existing image/motion batches were both paused. Do not resume automatically.
- Full-song clip coverage, audio alignment, character continuity and finalized delivery are **NOT VERIFIED**.
- The user-provided 5.04s Modal MP4 matches approved Glass Love private storage checksum and contains visible subject motion. It is valid motion evidence, not complete sponsor flow evidence.

## Safety and deployment workflow

1. Exact-source GitHub tests; ensure negative-case CORS tests and complete CI pass.
2. Read deployed snapshots for all six Edge functions. Reconcile only expected changes against their source hashes; no blind deployment.
3. Release the origin-only patched versions through a controlled, reversible deployment. Verify preflight OPTIONS: known production and explicitly admitted preview origins receive matching allow-origin; attacker and unconfigured origins receive no matching header.
4. Authenticate as owner in the exact admitted preview and run only cost-free stage preflights and save/reload tests; record network status/correlation IDs without exporting JWTs.
5. Once budget/provider and owner approval are established, execute **one** bounded render; verify saved job provenance, measured MP4 metadata and on-device playback. Then consider full-song batch coverage and assembly.
