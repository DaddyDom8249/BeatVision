# BeatVision — Groq Toolbox & Live Production Audit (2026-10-13)

## Authority and scope
- GitHub source: `DaddyDom8249/BeatVision`, main at `9e6619f6e0b910754e55e1b88992598c05eb957f` (verified from GitHub branch API).
- Production alias `beat-vision-theta.vercel.app` points to READY Vercel deployment `dpl_ERCJW2z1BzKt5JVx5S74kbZPxdTK`, Git commit `03b84e920c66ef0418be96fe7e1c202db901d137` on `repair/production-reconcile-20261012`.
- GitHub compare main...production reports `diverged`: production branch **75 commits ahead** and **6 commits behind** main, with distinct migrations, tests, and page/backend changes. Do NOT automatically promote main over this deployment.
- Read AGENTS.md, complete PROJECT_LOG.md, docs/audits/2026-10-08-production-debug.md and docs/integration-repair-20261011/FORENSIC_INTEGRATION_REPORT.md.
- Inspected current main controller `supabase/functions/beatvision-generation/index.ts` and `src/pages/ProductionWorkspacePage.tsx`. Also queried live Supabase job aggregates/policies and Vercel deployment metadata, without invoking media providers or mutating data.

## Groq toolbox actual test
- Microfn function: `richardcranium466/groq-codex-toolbox`; deployed, MCP tool enabled, `GROQ_API_KEY` configured.
- An actual `ask_groq` request using Groq model `openai/gpt-oss-120b` returned a correct response. Real `review_code` calls received and analyzed source excerpts.
- Groq audit suggestions are **untrusted hypotheses**. In particular, it suggested stripping an Authorization header prefix and replacing an image URL when approval returns a row. **Neither is verified as a bug**: existing code passes an explicitly formed Authorization header; image display deliberately uses a re-signed private URL, and `approveImage` preserves the previously re-signed URL. Do not change either without a failing reproduction.
- No repository write or shell access was given to Groq.

## Verified production database state (read-only 2026-10-13)
| Job type | Completed | Failed |
|---|---:|---:|
| scene_image | 17 | 24 |
| scene_motion | 17 | 26 |
| assembly | 1 | 0 |

- 1 row in `final_videos` marked `complete`, `mp4`, `hd`, `segment_count=8`, associated with a completed assembly job. Media playback, duration matching and lip sync were NOT tested in this audit.
- **All 17 completed scene_motion job responses report `generation_type=PROCEDURAL_MOTION` with `arena_provider=shotstack`.** This is not evidence of actual AI-animated performers or singing lip sync.
- Motion asset rows include 8 `approved` `shotstack/image-motion`, 8 older `generated` `arena/ltx-video` and 1 unapproved Shotstack row.
- Current production storage write policies `legacy_storage_owner_insert/update/delete` enforce `owner_id=auth.uid()`, correcting the older 2026-10-08 audit's reported bucket-only write policies. Old report is historical, not current live vulnerability evidence.
- Storage buckets `scene-images` and `render-manifests` are currently public; `songs` and `visual-assets` are private. Whether public legacy buckets contain sensitive files needs separate owner/path inventory before policy edits.

## Static source findings and limitations
- On main, `modelFor('scene_motion')` requests `ltx-video` but this is not proof of delivered model. Completion provenance is available in Arena result; production reports Shotstack procedural output. The UI checks for `image-motion`/`PROCEDURAL_MOTION` to label the procedural fallback.
- Main controller sends `generation.cost_class='free'` on request. A request label alone does not prove the provider cannot charge. Do not submit any generation while zero-cost entitlement is unverified.
- Main code search did not return `HF_VIDEO_TOKEN`, `musetalk`, or `latentsync`; no integrated free singing-lip-sync path was verified in production or main.
- GitHub CI for main commit `9e6619f6`: BeatVision Production CI run 38189505665 SUCCESS, with `npm install`, `npm test`, `npm run production-audit`, `npm run build` steps successful (2026-10-12).
- Master Audit run 38399305807 SUCCESS (2026-10-13) but checked directory existence only; it is not a full E2E audit.
- Current audit did not execute repository npm tests in a checkout. This environment lacks GitHub network access for `git clone`. Existing CI evidence is stated separately and does not verify production user workflow.

## Priority / next safe work
1. **P0 provenance & product fidelity:** Current approved clips are procedural, not validated animated singing characters. Keep this limitation clearly visible. Make completion criteria distinguish genuine subject animation and measured lip sync from simple MP4 presence; regression-test against recorded procedural fixtures; do not replace approved assets.
2. **P0 zero-cost backend:** Vet legal and genuinely no-billing hosted motion and lip-sync APIs. Integrate only server-side after endpoint, cost, quota, licensing, and API access are verified. Fail closed without paid/unknown fallback.
3. **P0 release reconciliation:** Compare 75 ahead/6 behind branch with main and inspect migrations/tests before a proposed integration PR. Do not merge main or deploy without safe exact-head regression and release verification.
4. **P1 authenticated production:** Test on a valid authorized account, without generation, whether Ghast navigation, approved scene playback, and final video download work. A READY deployment is not enough.
5. Reassess static Groq suggestions only after reproducing; do not apply generated edits blindly.

## Status classification
- Groq tool connection & response: **VERIFIED**.
- Repo baseline and main CI: **VERIFIED as described**.
- Production DB counts / procedural provenance: **VERIFIED by read-only queries**.
- Free real AI motion, vocal lip sync, full playback, mobile workflow: **NOT VERIFIED**.
- Safe source and production changes: **none**; report-only branch.
- Paid calls/media generation: **none**.
