# BeatVision

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/DaddyDom8249/BeatVision?utm_source=oss&utm_medium=github&utm_campaign=DaddyDom8249%2FBeatVision&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

**Every Song Has a World. BeatVision Reveals It.**

BeatVision is an **artist-directed AI music-to-video creative platform** in active development. It starts with the music, builds an editable visual world, and carries the creator's approved direction through scenes and generation. **It is a working prototype, not a claim of a production-complete music-video service.**

- **Development site:** https://beat-vision-f8nn.vercel.app/
- **Partnerships:** beatvision.partnerships@gmail.com
- **Source of truth:** this GitHub repository. Browser-visible functionality, generation capacity, and final output availability may vary.

## What makes BeatVision different

| Creative step | What the creator controls |
| --- | --- |
| Song and analysis | Start with authorized audio; review interpretation rather than accept it as fact. |
| World Reveal | Confirm or revise the song's mood, narrative, environment, and visual language. |
| Style and Vision Lock | Maintain approved characters, environments, palette, visual rules, and continuity. |
| Visual plan / scene direction | Review timings, shot intent, and scene-level direction before generation. |
| Scene assets and motion | Inspect generated media, keep approvals explicit, and distinguish a failed job from a completed output. |
| Timeline and final video | Intended final assembly path; **repeatable, durable downloadable export is not yet verified end-to-end**. |

**Product flow:** Song → Analysis → World → Style / Vision Lock → Visual Plan → Scene Direction → Images → Approval → Motion → Final Output.

The artist directs; AI providers produce candidate media. Approved creative state must not be silently overwritten.

## Current evidence and limits (18 October 2026)

Production project records and engineering logs show authenticated project flows, world/style planning, approved scene imagery, and saved short AI motion clips. A production-origin CORS correction allowed an existing approved image to be signed and displayed. These are useful integration milestones, **not** proof that an arbitrary new song produces a complete downloadable video.

- **Image generation:** Cloudflare Workers AI FLUX Schnell is configured behind a server-controlled, confirmed-free execution path; live availability remains subject to provider quota and specific runtime verification.
- **Motion:** Hugging Face ZeroGPU has produced short motion in existing projects. A recent authorized attempt recorded `HF_GENERATION_FAILED`, but the provider's raw error was not saved, so quota exhaustion, capacity limits, and inference/input failures cannot be distinguished. Remaining free quota and reliable availability are **unverified**.
- **Assembly:** Sandbox/stage output has existed; its watermark, durability, access, and downloadable eligibility are distinct from production-ready final export. A complete new-song-to-final-MP4 run is **not verified**.
- **In-flight improvements:** Separate source reviews address scene-specific motion UI state, signing recovery, quota messages, and output status. An open PR or passing unit tests are not production proof.

For status and verification boundaries, see [PROJECT_LOG.md](PROJECT_LOG.md), [AGENTS.md](AGENTS.md), and the [open pull requests](https://github.com/DaddyDom8249/BeatVision/pulls).

## Architecture

```text
React / Vite frontend (Vercel)
       |
Supabase Auth + PostgreSQL + private Storage + Edge Functions
       |
BeatVision generation controller (ownership, authorization, jobs)
       |
Arena provider gateway and approved integrations
       |-- Cloudflare Workers AI FLUX Schnell (conditional free scene images)
       |-- Hugging Face ZeroGPU (quota-limited image-to-video)
       `-- Shotstack sandbox/stage (conditional test assembly, not final paid output)
       |
Saved assets and job state --> Supabase --> authenticated studio UI
```

Provider access is conditional, never guaranteed. No paid or unverified-cost fallback may be enabled without owner authorization. The database, not generated provider response text, is authoritative.

### Engineering and security principles

- GitHub is the source of truth; never treat an unmerged branch as shipped.
- Authenticated owner checks and Supabase RLS must remain intact.
- Secrets remain server-side; approved media cannot be silently replaced.
- Generation jobs use bounded retries and explicit queued/submitted/processing/completed/failed states.
- User-authorized songs and media only; do not disclose private projects in public demonstrations.

## Local development

```bash
npm install
npm test
npm run production-audit
npm run build
```

Passing these checks validates their covered code paths, not provider quotas, user authorization on a live session, or a complete production video.

## Partnerships and sponsorship

BeatVision is exploring **capped 60–90-day technical pilots** for GPU/inference capacity, AI credits, commercial-use hosting support, or engineering guidance. The immediate measurable goal is a rights-cleared, creator-approved song-to-video workflow with verified, durable output and observed resource use.

Contact: **beatvision.partnerships@gmail.com**

See the [sponsorship pre-send checklist](docs/sponsorship/PRE_SEND_CHECKLIST.md). This README does **not** claim an incorporated company, registered trademark, existing sponsor, established subscription revenue, or general availability.
