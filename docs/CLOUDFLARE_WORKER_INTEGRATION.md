# Cloudflare Worker Integration

## Frontend

Set:

`VITE_BEATVISION_WORKER_URL=https://<your-worker>.workers.dev`

The frontend Worker client is `src/services/beatvision-worker.ts`.

## Worker secrets and variables

Configure these with Wrangler or the Cloudflare dashboard. Never commit secrets:

- `PIXAZO_API_KEY` — enables real Pixazo LTX motion generation.
- `PIXAZO_LTX_ENDPOINT` — optional override. Default is the Pixazo LTX 2.5 Lite image-to-video endpoint.
- `GATEWAY_TOKEN` — optional Worker-to-client bearer protection.
- `ALLOWED_ORIGIN` — deployed BeatVision frontend origin.

The default LTX 2.5 Lite request uses `prompt`, `image_url`, `duration` and `resolution`. The Worker deliberately strips unsupported frontend fields before submitting to the provider.

## Motion contract

`POST /v1/motion/jobs/:job_id`

Body requires:

- `project_id`
- `idempotency_key`
- `input.prompt`
- `input.image_url`

Optional motion input includes `duration` and `resolution`.

The Worker persists the job in `MOTION_JOBS`, submits to Pixazo LTX, stores the provider request ID, and polls using Durable Object alarms. Polling has a durable upper bound so a provider that never completes cannot create an infinite job.

`GET /v1/motion/jobs/:job_id`

Returns the durable job state and, on success, the generated video URL and asset ID.

## Image contract

`POST /generate-image`

The existing Workers AI image-generation route remains in place. It is intentionally separate from language/world generation.

## Security note

Browser access should be restricted with `ALLOWED_ORIGIN` to the deployed BeatVision frontend origin. Provider credentials must remain Cloudflare secrets and must never be exposed through `VITE_*` variables.

## Verification

Deterministic CI must not call Pixazo, Shotstack, or other paid/external generation providers. Live provider verification is a separate authorized operation.
