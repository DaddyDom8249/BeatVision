# BeatVision — Video-discovered tools: integration parking lot
Date: 2026-10-09
Status: RESEARCHED / PARKED; no provider integration authorized by this document
Target branch: `feature/optional-free-ai-providers-20261009` (NOT `main`)
Source: three TikTok demonstration videos provided by owner, ~57.37s / ~55.35s / ~51.11s; screenshots/claims are discovery leads, not API or free-quota proof.

## Executive decision
- **Pinokio (READY FOR CONTROLLED LOCAL EVALUATION; NOT A MEDIA PROVIDER):** Official desktop one-click launcher to install and run open-source AI apps. Useful as a disposable **developer-side testing harness** for free models if the owner has a suitable Windows/Linux/macOS GPU computer. Not a Vercel/Supabase Edge runtime and not a hosted inference API. No installation was executed. Security: installers/scripts can execute shell commands; pin versions, examine launcher scripts, sandbox, never inject production secrets. Official site: https://desktop.pinokio.co/ ; source/script policy: https://github.com/pinokiocomputer/pinokio ; desktop releases: https://github.com/pinokiocomputer/pinokio/releases .
- **Design Arena / DesignArena (CONDITIONAL READ-ONLY MODEL RESEARCH):** Official public website compares image, image-edit, image-to-video, video and speech model quality. Its *documented developer API* requires an approved bearer key and provides **only** `GET /arenas`, `GET /models`, `GET /leaderboard/{arena}/{category}` (leaderboard/metadata); no documented media-generation endpoint. Could be used to build a read-only, opt-in provider comparison dashboard, but **cannot** be used as a media-generation backend on currently documented API. Manual rankings research is more valuable now. API key requires application and attribution obligations; cost/key access still UNKNOWN. Website terms prohibit unauthorized automated scraping/search and broad commercial usage; do not automate consumer UI. **Privacy:** avoid uploading owner's unreleased songs, character media, or confidential references: service terms permit broad reuse and sublicense of user input. Official: https://www.designarena.ai/ ; API: https://docs.designarena.ai/api-reference/overview ; terms: https://www.designarena.ai/terms-and-conditions ; privacy: https://www.designarena.ai/privacy-policy .
- **Arena / LM Arena (MANUAL COMPARISON ONLY; API EVALUATION BLOCKED BY FREE COST PROOF):** The first two videos pitch side-by-side frontier models as 'free unlimited.' That is **not true for unlimited use**: Arena documents per-model/overall rate limits and daily credit/usage caps. Consumer site terms restrict automated/programmatic querying and scraping. Do NOT use browser automation to extract generation output as a production provider. **Nuance:** a separately documented `api.preview.arena.ai` API gateway offers key-authenticated chat, audio speech, image generation and edits. That is a possible legitimate integration *path*, not proof of a zero-dollar API tier; documentation references billing/spend. Evaluate only after official current API access, permitted commercial rights, exact model list, quotas, pricing and cost ceiling are confirmed. Until then, do not add active adapter, fetch production media or expose secrets. Official docs: https://portal.api.preview.arena.ai/docs/api-reference ; API limits: https://portal.api.preview.arena.ai/docs/rate-limits ; Arena web terms: https://help.arena.ai/articles/5629909088-terms-of-use?lang=en ; daily limits: https://help.arena.ai/articles/3295820808-arena-troubleshooting-daily-usage-limits ; rate limits: https://help.arena.ai/articles/8931786544-arena-how-to-rate-limit .

## Applicability to BeatVision (current stage)
| Candidate | Real benefit | Potential placement | Code implementation now? | Evidence/unknown |
|---|---|---|---|---|
| Pinokio | Install/test locally-hosted Wan, Step1X, open model demos, inspect GPU/memory/latency | developer tooling separate from production | NO; evaluate locally when suitable host exists | Local machine GPU specs and executable models NOT VERIFIED |
| Design Arena | Compare model quality and benchmark trends to choose candidate provider | research; optional read-only provider catalogue | NO; documented API restricted to rankings, auth required | API key/attribution/cost not verified |
| Arena consumer app | Manually compare prompt outputs | human creative research, NOT automated generation | NO; consumer programmatic access forbidden by terms | Free unlimited claim contradicted by official rate limit docs |
| Arena API preview | Candidate unified model gateway for text/voice/images | optional server-side provider research, feature-flag OFF | NO; free cost/quotas/availability UNKNOWN | docs list API operations but do not substantiate free unrestricted production use |
| Other names briefly scrolling in video 3 | model/catalog discovery only | NONE until individually verified | NO | No standalone supported integration identified |

## BeatVision acceptance conditions before promoting any item
1. **Zero cost verified** for realistic workload: no paid subscription, serverless charges, rented GPU, mandatory card, or undisclosed usage billing. Do not confuse free app/demo with free API. Document exact free quota/current date.
2. Official, documented permitted **programmatic API** (or local runtime under owner's direct control), licensing and commercial media output rights.
3. Server-side auth only, owner-check/RLS unchanged, signed media reads, never upload approved confidential assets to model-comparison sites without explicit consent.
4. Default feature OFF; no effect on `main`, production or existing FLUX Schnell/LTX providers. Missing provider -> explicit UNAVAILABLE. No hidden paid fallback.
5. Immutable approved assets; generated items are appended as draft; creator-controlled approvals; no WORLD/STYLE/SCENE/MOTION gate bypass.
6. Accurate async queued/submitted/processing/completed/failed states, provider/model provenance, idempotency, error bodies, real media and storage metadata; accurate song timecodes.
7. Reproducible local tests then a genuinely free authenticated E2E test; report separately. Any API/docs research alone is NOT VERIFIED as an integration.

## Recorded evidence
Source video 1 (Arena, Pinokio, DesignArena): SHA256 `361bc5b75b74a2690333e4c4bc388e19c5e673efed2b181a671f3b5210095ff2`.
Source video 2 (Arena consumer site): SHA256 `e203adf65c0ae208bb85b7cea804d5c027c9aa2f3c3dfc0a91f3b3eb14b93dd4`.
Source video 3 (AI-site/model list, Pinokio, DesignArena rankings): SHA256 `59ea029cb7e7b83c9e12a57c3c9abb98e575b1e01d17ecb699fba1ed0e0b000d`.
Video contents inspected by sampling original frames; no demo was run and no provider generated media for BeatVision.

## Parking disposition
**PINOKIO**: Evaluate for local model-development orchestration when owner's desktop GPU configuration is available; no auto-install.
**DESIGN ARENA**: Park a future low-priority read-only ranking connector pending free API key & licensing; use manual rankings now.
**ARENA**: No consumer automation. Park API discovery and follow up only after zero-cost and server-side use explicitly confirmed.
**ALL**: Do not merge, deploy, open new Jules sessions, edit production DB or perform paid inference based on this note. The existing production pipeline's verified blockers outrank speculative provider integrations.


## Fourth owner-supplied video (2026-10-09): Ruflo / Claude Flow multi-agent orchestration
**Source:** `820226f5e1357ff4e22087b0a660e566.mp4` (57.26 s, 576 x 1024, 30 fps). SHA-256 `35e5945e107f4e63742720051bbee7040509afd93628df2844a603c96fe6dd88`. Inspected 2-second-interval contact-sheet frames of the actual supplied video. The speaker presents **Ruflo** as a free GitHub-based agent harness, 60+ specialized agents, coordinated swarms, research/coding/testing/review, shared memory and dynamic LLM routing.

### Verdict: USEFUL DEV-TOOL CANDIDATE — PARK FOR ISOLATED EVALUATION; NOT A BEATVISION MEDIA PROVIDER
Ruflo (upstream `ruvnet/ruflo`) is an MIT-licensed multi-agent orchestration framework for Claude Code / Codex. It claims to supply agent roles, coordination, hooks, memory, MCP integration and model routing. Its repository reports multiple setup modes: limited plugin commands versus full CLI initialization, which generates `.claude/`, `.claude-flow/`, `CLAUDE.md`, helper scripts and settings. It is **not** an image/video generation provider and does not intrinsically make paid language-model API usage free. Its exact agent count and claimed performance are release-dependent vendor claims, not independently verified benchmarks.

**Real potential BeatVision benefit:** coordinated, bounded engineering work such as separate read-only code investigator, test runner, Supabase Edge contract reviewer, CI/PR reviewer and independent security reviewer; route discoveries into ONE supervisor decision before any allowed patch. Existing Jules/Codex/GitHub tools already handle some of this, so a second autonomous control plane could duplicate work and increase risks. Do not replace or silently override the existing Jules supervision.

**Critical security evidence:** Ruflo maintainers published advisory `GHSA-c4hm-4h84-2cf3`: pre-3.16.3 Docker MCP bridge could expose unauthenticated remote tool execution and environment secrets. Maintainers report patched in 3.16.3; this is not proof that any newly installed release is safe. Consult official advisory and review the pinned version plus current dependency issues. **NEVER** expose an unauthenticated MCP HTTP endpoint, grant production GitHub/Vercel/Supabase credentials, allow autonomous self-deploy/self-merge, run a `curl | bash` installer, or start background unlimited swarms. Inspect install side effects first.

**Research sources:**
- Official upstream: https://github.com/ruvnet/ruflo
- README / setup modes: https://github.com/ruvnet/ruflo/blob/main/README.md
- License: https://github.com/ruvnet/ruflo/blob/main/LICENSE
- Security advisory: https://github.com/ruvnet/ruflo/security/advisories/GHSA-c4hm-4h84-2cf3
- Package: https://www.npmjs.com/package/ruflo

**Safe evaluation plan, NOT executed:**
1. Create a disposable local copy/worktree of `feature/optional-free-ai-providers-20261009` with no connected production environment variables or tokens, and inspect baseline `git status`.
2. Research pinning a reviewed Ruflo release (at least 3.16.3 for the specifically known bridge vulnerability, but inspect subsequent advisories), package dependencies and plugin hooks. No remote installer execution.
3. Run **one** tightly scoped, read-only repo audit and a non-production test in a sandbox with network and write restrictions. Do not allow background workers or sessions, never open production MCP ports. Track exact commands and file mutations.
4. Compare actual results against the existing single Jules/Codex workflow (defects found, reproducibility, tests, token/API cost and operator overhead). Retain only if measured benefit is substantial and cost is verified zero.
5. If future adoption is approved, keep Ruflo in developer tooling only; always require explicit human approval for writes to production, merges, deployments and media/API billing.

**Implementation decision:** PARKED (developer-side orchestration experiment only). No Ruflo package installed, no new Jules tasks, no implementation branch/source edits beyond this research note, no provider integration, no live execution or proof of security fitness. Preserve current production delivery priorities and approved assets.
