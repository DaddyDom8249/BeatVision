# BragoraForge (formerly BeatVision)

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/DaddyDom8249/BeatVision?utm_source=oss&utm_medium=github&utm_campaign=DaddyDom8249%2FBeatVision&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

An artist-directed AI music-video prototype. The repository and deployed interface retain some BeatVision names during the rebrand.

## Prototype access and limits

Open https://beat-vision-theta.vercel.app/auth. Create an account you control, confirm its email if required, and sign in. Use your own audio in a new project. Save Song Details, then Analyze Music Signal. Review the editable interpretation and explicitly confirm it before revealing its World. Continue through the World, Style, and scene approval gates; approval is always the artist’s decision.

Short AI motion has been demonstrated, but consistent character identity, reliable full-song delivery, and singing lip sync remain unfinished. A recorded clip does not prove a repeatable end-to-end journey. Provider quotas and available compute can stop generation; there is no automatic paid fallback. Do not upload confidential material for a sponsorship evaluation.

A limited technical-pilot inquiry is supportable. This is not a production-ready product or a guaranteed self-service full-song demo. See [current release gates](docs/SPONSOR_DEMO_RELEASE_GATES.md) and the [stage-by-stage evidence checklist](docs/SPONSOR_DEMO_TODO.md) for dated observations and remaining work.

## Local checks

Use Node 22 or newer. This repository currently has no committed dependency lockfile.

```sh
npm install --ignore-scripts --package-lock=false --no-audit --no-fund
npm test
npm run production-audit
npm run build
```

Passing these checks establishes source-level evidence, not live provider quality or full workflow success.

## Product flow

Song → Analysis → Artist-confirmed interpretation → World → Style → Vision Lock → Scenes → Image approval → Motion → Final Video

## Architecture

- React/Vite frontend on Vercel.
- Supabase Auth, PostgreSQL, private storage, and authenticated Edge Functions.
- Groq for guarded song transcription and creative proposals; local signal analysis remains separately identified as estimates.
- BeatVision owns World, Style, Vision Lock, scene timing, revisions, and approvals.
- Arena executes allowed scene-image and assembly requests. Existing integrations include Cloudflare Workers AI images and Shotstack sandbox assembly.
- Modal is the primary motion selection; Hugging Face is an explicitly selected fallback. Availability and cost guards remain mandatory; selection does not prove output quality.
- The database owns durable job state and media provenance. Provider completion alone does not establish creative acceptance or full-song coverage.

## Core invariants

- Git records implementation history; the database is authoritative for durable creative state. Verify the serving deployment before releasing a repair: production can be ahead of `main`.
- Provider secrets stay server-side.
- The database is authoritative for durable state.
- New batches append; they never erase earlier assets.
- Approved assets are never silently replaced.
- Async jobs use queued → submitted → processing → completed/failed.
