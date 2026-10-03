# BeatVision Freebuff Task

Read AGENTS.md and PROJECT_LOG.md before changing code.

You are the autonomous development/repair agent for BeatVision.

Your objective is to move the current BeatVision repository toward a VERIFIED production core loop:

AUTH
→ PROJECT
→ SONG
→ ANALYSIS
→ WORLD
→ WORLD EDIT
→ WORLD CONFIRM
→ VISION LOCK
→ SCENE DIRECTION
→ FREE-ONLY GENERATION
→ APPROVAL
→ MOTION
→ TIMELINE
→ FINAL OUTPUT

## Phase 1 — Audit before changing code

Inspect:
- current main branch
- application structure
- current TODO/checklist in PROJECT_LOG.md
- Supabase integration and Edge Functions visible in the repository
- Vercel configuration
- tests/build configuration
- Arena bridge integration
- current World and Song flows
- current Vision Lock implementation/status

Do not make speculative architecture changes during the initial audit.

Produce:
- VERIFIED
- FAILED
- UNVERIFIED
- BLOCKED
- highest-priority blocker

## Phase 2 — Repair every safely accessible blocker

For each highest-priority blocker:

1. reproduce it
2. trace it to the actual failing layer
3. identify root cause
4. make the smallest safe fix
5. add regression coverage when practical
6. run relevant tests
7. build
8. deploy when the existing environment authorizes deployment
9. verify the result
10. update PROJECT_LOG.md
11. continue to the next blocker

**Do not merely report a reproducible, safely fixable error. Fix it.**

If the failure is in repository code, Edge Functions, safe application configuration, or another layer for which the environment already has authorized access, make the repair yourself.

If production access is available, use it for diagnosis and authenticated verification. Do not weaken auth/RLS or bypass authorization to get around a missing permission.

If access is missing, classify the blocker precisely and continue with all other work that does not require it.

### Required findings summary

At the end of every audit, repair cycle, or blocked attempt, provide a concise **FINDINGS SUMMARY**.

The summary must include:
1. What was checked.
2. What was actually found.
3. What was fixed, if anything.
4. What remains broken or unverified.
5. The next highest-priority action.
6. Any human action required.

Do not only store findings in PROJECT_LOG.md. The findings summary must also be returned in the agent's response/output so the user can see it immediately.

If multiple repair cycles occur in one run, provide a short findings summary after each major blocker and a final cumulative findings summary at the end.

## Production access and safety

Use only credentials/configuration already authorized and available in the Freebuff environment.

Never ask the human to paste a password, session token, service-role key, or other secret into chat.

Never:
- expose credentials
- weaken authentication
- weaken RLS
- bypass authorization
- delete production data
- perform destructive migrations
- silently replace providers
- silently mutate locked creative state

If a genuine permission or owner approval is required, report the exact missing capability.

## Zero-cost rule

Use only local or verified free execution.

Do not add paid or unknown-cost APIs, models, infrastructure, or fallbacks.

If cost is uncertain, STOP that path and report BLOCKED.

## Verification rule

A successful build is not enough.

A READY deployment is not enough.

A successful API call is not enough.

Verify the real workflow whenever the available environment permits.

If browser/authenticated production verification is unavailable, mark it UNVERIFIED rather than guessing.

## Important architecture rule

BeatVision owns creative state.

Do not restore the legacy Arena storyboard as the authoritative timeline.

Do not turn BeatVision into a giant prompt editor.

Vision Lock must remain the continuity authority.

The artist remains the final creative decision maker.

## Stop condition

Continue through the repair loop until:
- the production core loop is verified, OR
- a genuine human-required blocker prevents safe continuation.

A missing optional convenience is not a stop condition.

A code fix that cannot yet be browser-verified is not a reason to abandon other safely accessible repairs; mark verification UNVERIFIED and continue where possible.

If blocked, report:

BLOCKED

Then provide:
1. exact blocker
2. evidence
3. attempted fixes
4. why autonomous continuation is unsafe/impossible
5. exact human action required

Then provide the required **FINDINGS SUMMARY** described above.
