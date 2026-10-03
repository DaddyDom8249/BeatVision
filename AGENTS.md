# BeatVision Agent Instructions

## Mission

BeatVision is an artist-directed AI music-video system.

Core principle:

> Artist directs. AI produces.

Primary workflow:

SONG → ANALYSIS → WORLD → STYLE → VISION LOCK → SCENE DIRECTION → GENERATION → APPROVAL → MOTION → TIMELINE → FINAL OUTPUT

The agent's job is to make this workflow work in production. Prioritize fixing blockers and completing the core loop over adding unrelated features.

## Hard constraints

### Zero cost

BeatVision must remain zero-cost unless the human owner explicitly authorizes a paid service.

Allowed:
- local execution
- verified free services/models

Not allowed without explicit approval:
- paid APIs/models
- paid infrastructure
- paid fallbacks
- unknown-cost providers

If a provider's current cost cannot be verified, classify it as UNKNOWN and do not use it.

Never silently switch to a paid provider.

### Never fake completion

A build, READY deployment, API response, database row, mock, or unit test is not by itself proof that a user workflow works.

Prefer evidence in this order:
1. real authenticated production workflow
2. browser verification
3. production API/database/storage evidence
4. integration/E2E tests
5. automated tests
6. build/type-check/lint
7. static inspection

If a required behavior cannot be verified, mark it UNVERIFIED.

### Security

Never:
- weaken authentication
- weaken Supabase RLS
- expose secrets
- expose service-role credentials to the browser
- bypass authorization to make a test pass
- delete production data without explicit human approval
- perform destructive production migrations without explicit human approval

The current project ownership field is projects.owner_id. Do not assume user_id.

## Continuous repair loop

For each blocker:

1. inspect current state
2. reproduce the failure when possible
3. trace it to the actual failing layer
4. identify the root cause
5. make the smallest safe repair
6. add/improve regression coverage when practical
7. run relevant tests
8. build
9. deploy when appropriate
10. verify production behavior
11. update PROJECT_LOG.md
12. choose the next highest-priority blocker

Do not repeatedly retry the same failed approach. Change the diagnostic hypothesis.

## Architecture

BeatVision owns the creative state. Generation providers do not.

Conceptual model:

PROJECT
  └── SONG
      ├── ANALYSIS
      ├── WORLD
      ├── STYLE
      ├── CHARACTERS
      ├── ENVIRONMENTS
      ├── VISION LOCK
      ├── STORY
      └── SHOTS
           ├── SCENE IMAGE
           ├── MOTION
           └── APPROVAL

Do not turn BeatVision into a generic prompt-to-video application.

The artist controls world, characters, environments, wardrobe, action, camera, lighting, motifs, scene intent, deliberate changes, and approval. AI may propose; the artist approves.

## Vision Lock

Vision Lock is a core continuity mechanism.

It should preserve, as applicable:
- world version
- style version
- character versions
- environment versions
- reference assets
- approved visual state
- palette
- lighting
- wardrobe
- camera language
- movement language
- visual motifs
- continuity rules

Locked state must not be silently changed. Intentional changes must be explicit and versioned.

## Song analysis

Distinguish verified signal-derived facts from interpretation.

Local analysis may provide duration, sample rate, channels, RMS, peak, silence ratio, energy curve, BPM estimate, key estimate, and structural candidates.

AI-derived information may include transcription, lyrical themes, mood, emotional arc, genre, and narrative interpretation.

Never represent a heuristic as ground truth. If transcription fails but manual lyrics exist, preserve and use the manual lyrics.

## World Reveal

World Reveal must produce structured creative state including:
- mood
- emotional arc
- visual language
- cinematography
- environments
- color/lighting
- motifs
- atmosphere
- movement
- continuity rules
- immutable continuity

World state is editable before confirmation. After confirmation, changes require explicit revision.

## Scene Direction

Scenes must derive from the locked creative state.

Eventually capture:
- scene purpose
- song section
- musical timing
- lyrics/context
- characters
- location
- action
- camera
- lens/framing
- movement
- lighting
- time/weather
- visual event
- duration
- relevant Vision Lock state

Do not use hard-coded mock scenes as the authoritative production timeline.

## Generation

Prefer provider-neutral lifecycle interfaces:
- submit
- status
- output

Generation should support stable IDs, idempotency, bounded retries, explicit states, provider errors, provenance, and output asset references.

Never retry indefinitely or silently switch providers.

## Arena

Arena is the generation bridge. BeatVision remains authoritative for analysis, world, style, Vision Lock, scene direction, approvals, and timeline.

Do not restore the legacy Arena storyboard system as the authoritative timeline.

Only free/approved generation paths may be used.

## Supabase and Vercel

Supabase is the current backend. Preserve authenticated Edge Functions, RLS, private storage, and explicit ownership checks.

Vercel is the current production frontend/deployment platform.

A READY Vercel deployment is not proof that the workflow works. Verify the user workflow when possible.

## Legacy code

Do not delete legacy code merely because it is old. First determine whether production depends on it.

When replacing legacy functionality:
1. establish the new authority
2. migrate callers
3. verify production
4. retire the old path

## Project log

Maintain PROJECT_LOG.md.

For every significant work cycle record:
- date/time
- objective
- failure/issue
- investigation
- evidence
- root cause
- files changed
- database changes
- deployment
- verification
- success/failure
- remaining uncertainty
- next blocker

Never rewrite history to hide a failure.

## Priority order

1. production blockers
2. authentication
3. project creation
4. song intake/save
5. song analysis
6. World Reveal
7. world editing
8. Vision Lock
9. Scene Direction
10. generation
11. approval/continuity
12. motion
13. timeline
14. final output
15. cleanup

Do not prioritize social publishing, marketplace/community, team collaboration, sophisticated editor, or automatic creative Autopilot until the core loop works.

## Human approval required

Stop and ask the human before:
- adding paid/unknown-cost services
- deleting production data
- destructive migrations
- weakening auth/RLS
- exposing secrets
- replacing the architecture wholesale
- changing the zero-cost requirement
- changing BeatVision's core creative philosophy

Safe bug fixes, tests, refactors, and ordinary implementation work may proceed autonomously.

## Completion standard

The core loop is not complete until there is evidence that:
- auth works
- project creation works
- song upload/save/persistence works
- analysis works
- World Reveal works and persists
- world editing/confirmation works
- Vision Lock persists
- Scene Direction uses Vision Lock
- generation receives the correct locked state
- asset provenance persists
- approval/rejection works
- approved scenes remain immutable
- continuity carries to later scenes
- motion uses approved scene imagery
- timeline uses real persisted scenes
- final assembly/output works
- no paid/unknown provider path exists
- auth and RLS remain intact

Use these statuses precisely:

VERIFIED
UNVERIFIED
FAILED
BLOCKED

Do not say "probably fixed", "should work", or "everything is ready" without evidence.
