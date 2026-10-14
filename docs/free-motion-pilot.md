# BeatVision strictly-free image-to-video pilot

## Current implementation

- Worker Arena **draft**: [BeatVision-arena PR #38](https://github.com/DaddyDom8249/BeatVision-arena/pull/38). Adds explicit `wan2.2-zerogpu` model through a 0.5–3 second preview route. This is actual AI image-to-video when the public Space completes; not procedural pan/zoom.
- Primary app **draft**: new `beatvision-free-motion-pilot` Supabase Edge Function plus a Studio “Generate free 3-second AI movement” preview button.
- Uses already bound Cloudflare secret `HF_VIDEO_TOKEN`, a verified Hugging Face **free/non-Pro** identity, and the currently approved Supabase image. No tokens are copied into the browser.
- The pilot never changes approved images, motion clips, or final videos and never calls paid Pixazo or any billing endpoint. The preview is temporary and cannot count as coverage for a longer approved scene.
- Exactly one approved scene image is signed with a short-lived URL, scoped to the authenticated project owner.

## Provider eligibility

| Provider | Use | Strict zero-cost status |
|---|---|---|
| Hugging Face Wan 2.2 ZeroGPU Space | 3s generative image-to-video preview | Conditional: Free account daily ZeroGPU quota; backend refuses Pro or unknown identity |
| Groq free plan | Script, language, voice via Orpheus separately | Conditional on account's verified free allowance and no paid overflow |
| Shotstack sandbox | Assembly or procedural pan/zoom | Sandbox-only, may watermark output; not generative person motion |
| Pixazo LTX API | Generative image-to-video | **Blocked**: initial wallet top-up violates zero-payment policy |
| FFmpeg offline | Free deterministic 2D character animation | Available locally; not AI motion generation |

## Verification and safety

Source regression tests should pass at exact branch HEAD. Live Hugging Face ZeroGPU queue/API acceptance remains NOT VERIFIED until the Worker is safely deployed and a single zero-charge pilot completes. A Space can queue, reject API access, change its schema, or run out of quota. All those conditions must yield explicit unavailable messages rather than fake success or billing.

Do not merge either draft, deploy production, auto-approve creative assets, replace Ghast's approved motion, or invoke any paid provider without a separate verified release gate. Existing production code is on a different lineage from GitHub main; the app PR deliberately targets its actual production branch.

Successful three-second motion preview is not a 249-second music video. More free capacity and full-scene duration alignment are required before final assembly.

## Job status and timeout correction (2026-10-13)

The pilot is asynchronous. One POST creates a Gradio event after uploading the single approved image. The server returns an HMAC-signed ticket restricted to creator, project, scene, and a 20-minute expiry. GET status polls complete/error SSE under a bounded timeout; timeouts report processing, never start a new GPU generation. The Studio previews returned media only after confirmed completion. Tickets do not persist in the database and are intentionally lost on browser reload. No second job may be automatically submitted.

Backend activation remains blocked until the reviewed Arena PR #38 is deployed safely and the existing Supabase runtime configuration is verified. The source works only where the free HF token and approved source image exist; no credit spending or billed provider fallback is possible in this flow.
