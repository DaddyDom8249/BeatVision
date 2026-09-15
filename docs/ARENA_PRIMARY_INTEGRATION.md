# Arena-first BeatVision pipeline

The original BeatVision application keeps its own product/UI/data model. `BeatVision-arena` remains a separate execution repository and is used through its versioned gateway contract.

## Primary execution path

Song → World/Storyboard → approved scene images → Arena motion jobs → deterministic Shotstack assembly → actual MP4.

Arena creative path:
- Pixazo Flux Schnell / SDXL for world and scene artwork.
- Pixazo LTX for image-to-video motion.
- Shotstack Sandbox for deterministic timeline assembly, audio, and MP4 output.
- Pollinations remains an Arena language/audio adapter where the Arena contract requires it.

The original application's older provider adapters remain in the repository as optional integrations. They are not the default creative/video execution path.

## Server-only configuration

The Supabase `beatvision-arena` Edge Function requires:

- `ARENA_GATEWAY_URL`
- `ARENA_GATEWAY_TOKEN`

Neither value belongs in browser code, source control, or project database rows. Provider credentials stay server-side. Cloudflare recommends Worker secrets for API keys and authentication tokens rather than plaintext configuration. urlCloudflare Workers secrets documentationhttps://developers.cloudflare.com/workers/configuration/secrets/

## Integrity requirements

The Arena gateway remains responsible for storyboard validation, timeline coverage, media provenance, durable animation jobs, and Shotstack final-render validation. BeatVision must not mark a final render complete until Arena returns an actual final media URL.
