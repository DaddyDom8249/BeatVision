# Hugging Face zero-cost motion — 2026-10-13

## Reconciled baseline

Serving Vercel alias: beat-vision-theta.vercel.app, deployment dpl_ERCJW2z1BzKt5JVx5S74kbZPxdTK, branch repair/production-reconcile-20261012, SHA 03b84e920c66ef0418be96fe7e1c202db901d137. Main: 9e6619f6e0b910754e55e1b88992598c05eb957f. Main has 6 unique commits, serving branch 75. This repair starts at the serving commit. Main-only assembly readiness work remains separate; do not deploy main or merge this stacked PR into main blindly.

Generation v29 matches baseline source apart from trailing whitespace. Live migrations inspected; this change adds none and preserves every baseline migration. Existing Ghast has 8 approved images and 8 approved procedural Shotstack clips. Approved-row hashes before work: images 07e8a39f54b85127f90178b6896e6eb4; motion c01589201f36d2c9599b212d8331d504.

## Verified public metadata, not generated output

| Candidate | Runtime / source revision | Actual API | Eligibility |
| --- | --- | --- | --- |
| zerogpu-aoti/wan2-2-fp8da-aoti-faster | RUNNING / zero-a10g / 1ff7432a88d7827eb787ef10c15cbc5c85c841a2 | /generate_video | UNAVAILABLE: base Wan Apache-2.0, but converted cbensimon transformer and Kijai Lightx2v weights lack sufficient verified license evidence. |
| Lightricks/ltx-video-distilled | RUNNING / zero-a10g / 8a42e93469c66b62d794b83a4233f5fc8439e2b5 | /image_to_video | Conditional free candidate; owner explicitly confirmed under-$10M eligibility and enforcement of model-use restrictions in this session. Server token identity/runtime/schema must pass before any GPU POST. |
| henrybit/musetalk-1-5 | RUNNING / zero-a10g / 1bd58b7748557839bb585cb8ab6dd1399b80fcf9 | /generate | Research only. Upstream permits commercial model use, but additional dependencies and singing accuracy/identity preservation remain unverified. |

Each /config and /gradio_api/info returned a public queued Gradio endpoint. Wan Gradio 6.1.0; LTX 5.42.0; MuseTalk 5.49.1. Public endpoint visibility does not prove successful generation or per-token quota.

Official HF documentation https://huggingface.co/docs/hub/en/spaces-api-endpoints explicitly supports automated REST submission plus SSE results; free personal accounts receive 5 minutes/day, unauthenticated 2 minutes, PRO 40 minutes and prepaid extension. This adapter rejects PRO and organizations, only accepts the existing personal owner account, never buys quota, and never uses Inference Providers or upgraded hardware. LTX reserves 60 seconds xlarge (2x quota) for a short request. Remaining per-account GPU seconds have not been independently queried; quota exhaustion is a terminal explicit failure without another submission or paid fallback.

Sources: each Space's /api/spaces metadata, pinned app.py and YAML, live Gradio info; https://huggingface.co/docs/hub/en/spaces-zerogpu; https://huggingface.co/Lightricks/LTX-Video/blob/main/LTX-Video-Open-Weights-License-0.X.txt; https://github.com/TMElyralab/MuseTalk.

Supabase organization gxhotrxgisoxwunexmeg is verified plan=free/tier_free. Existing storage is 412120382 bytes. Adapter caps one output at 50 MiB; no infrastructure upgrade is needed for the single proof clip.

## Integration

The existing beatvision-generation controller remains authoritative. An owner-checked enqueue_ai_motion action appends a model/source-specific job from the approved image's frozen scene/lock snapshot. It preserves previous jobs and assets. A model-terms checkbox gates submission; acceptance timestamp is persisted. The LTX license is retained here and linked in the application.

The controller dispatches its HF adapter and normalizes responses to its existing Arena submit/poll contract. Existing job lifecycle, scheduler, project ownership checks, asset persistence and UI remain in use; no independent queue or generation service is introduced. New legacy-motion submissions fail closed rather than call Pixazo/Shotstack. Previously completed media remains readable. Existing image/assembly integrations are unchanged and not called by this test.

HF_VIDEO_TOKEN is read only inside the Edge Function. Every submission checks account identity, free account type, exact Space revision, running ZeroGPU hardware and API schema. Gradio POST is never retried on an ambiguous network result. Accepted event ID is persisted; bounded polling reads the same event without resubmission. Three transient polling failures and a 30-minute total deadline prevent endless work. Quota failure is explicit. The completed output is downloaded only from the allowlisted Space, bounded, checked for MP4 container/video samples/H.264/nonzero duration, saved with upsert=false to private visual-assets, and associated with the original approved image ID. Signed playback URLs are refreshed through the owner-checked motion_url action. Container validation is not subject-motion or lip-sync proof.

Two-second preview is explicit. It is not full-scene timeline coverage and must not be treated as a finished music video. Creator approvals are never automatic.

## Singing preparation

MuseTalk API inputs: [audio_path FileData, video_path FileData, bbox_shift=0, extra_margin=10, parsing_mode=jaw, left_cheek_width=90, right_cheek_width=90]. Output: Video plus diagnostic text. Short front-facing video and driving vocals are needed; upstream prefers 25 fps. GPU reservation estimates 45+18*media_seconds (60..600 seconds), so full-song processing exceeds a free daily allowance. Split work must never evade quotas or change identity.

After a real motion proof succeeds: verify exact dependency licenses; identify an existing isolated vocal stem or produce one with independently verified free compute; cut vocals to the scene's original song offset; resample video/audio without changing timing; compare mouth movements to sung consonants/vowels and inspect face identity. No vocal stem, accurate singing synchronization, or identity preservation is claimed from this integration. No MuseTalk GPU request is authorized until those prerequisites are established.

## Local release evidence

Baseline: npm install exit0; npm test161/161 exit0; build/audit exit0. npm ci failed because this repository intentionally excludes its lockfile; no reproducible locked-install claim. Candidate: npm test183/183 exit0; build/audit/diff-check exit0; Edge TypeScript check exit0 with platform type declarations substituted only. Tests mock provider boundaries and do not prove real video generation. Remote CI, credential eligibility, actual endpoint generation, storage output, decoding/motion inspection and browser playback remain separate release checks.
