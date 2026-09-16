# Cloudflare Worker Integration

## Frontend

Set:

`VITE_BEATVISION_WORKER_URL=https://<your-worker>.workers.dev`

The frontend Worker client is `src/services/beatvision-worker.ts`.

## Worker secrets

Configure these with Wrangler or the Cloudflare dashboard. Never commit them:

- `PIXAZO_API_KEY` — enables real Pixazo LTX motion generation.
- `SHOTSTACK_API_KEY` — optional server-side camera-motion fallback/assembly capability when implemented/configured.
- `GATEWAY_TOKEN` — optional gateway authentication for server-to-server callers.

## Motion contract

`POST /v1/motion/jobs/:job_id`

Body requires:

- `project_id`
- `idempotency_key`
- `input.prompt`
- `input.image_url`
- motion parameters

The Worker persists the job in `MOTION_JOBS`, submits to Pixazo LTX, stores the provider request ID, and polls using Durable Object alarms.

`GET /v1/motion/jobs/:job_id`

Returns the durable job state and, on success, the generated video URL and asset ID.

## Image contract

`POST /generate-image`

The existing Workers AI image-generation route remains in place. It is intentionally separate from language/world generation.

## Security note

Browser access should be restricted with `ALLOWED_ORIGIN` to the deployed BeatVision frontend origin. Provider credentials must remain Cloudflare secrets and must never be exposed through `VITE_*` variables.

## Verification

Deterministic CI must not call Pixazo, Shotstack, or other paid/external generation providers. Live provider verification is a separate authorized operation.
