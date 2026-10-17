# BeatVision-1 Shared State

Last initialized by: ChatGPT
Repository: DaddyDom8249/BeatVision
Baseline branch: main
Coordination branch: agent/chatgpt-grok-bridge
Initialization date: 2026-10-04

## Confirmed repository facts

- The GitHub repository is `DaddyDom8249/BeatVision`.
- The default branch is `main`.
- `AGENTS.md` already defines autonomous repair, zero-cost constraints, evidence standards, security rules, Arena architecture, Supabase/Vercel boundaries, and completion criteria.
- This coordination branch was created from `main`.
- The repository currently contains frontend, Supabase, scripts, docs, and an existing project log.
- The repository's current AGENTS instructions say `projects.owner_id` is authoritative and must not be replaced with `user_id`.
- Provider secrets must remain server-side.
- Paid or unknown-cost generation paths are prohibited without explicit owner approval.

## Important naming note

No GitHub repository named `BeatVision-1` was found through the connected GitHub repository search at initialization time.

Therefore this coordination layer is attached to `DaddyDom8249/BeatVision` and is intended to become the BeatVision-1 shared engineering layer. Do not create or rename a repository solely because of this note.

## Current coordination status

VERIFIED:
- ChatGPT coordination branch exists: `agent/chatgpt-grok-bridge`.
- Shared protocol file exists in this branch.

UNVERIFIED:
- Grok-side controller/branch has not yet been installed.
- No automated ChatGPT↔Grok API bridge has been connected.
- No live production workflow has been re-run as part of this initialization.

## Current task

Establish independent ChatGPT/Grok review and repair without allowing either model to become the sole authority.

## Next evidence required

1. Grok reads `.agents/PROTOCOL.md`.
2. Grok creates its own `agent/grok-*` coordination branch from the same baseline.
3. Grok writes its review/handoff state to `.agents/HANDOFF_GROK.md`.
4. Both sides agree on the same baseline commit before repair work begins.
5. First blocker is selected from evidence, not memory.

## Do not infer

Do not infer that any historical BeatVision bug is currently fixed merely because it appears in memory, PROJECT_LOG.md, or an older conversation. Reproduce or inspect the current repository/runtime.