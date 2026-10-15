# BeatVision subsystem map

Baseline: `f2e137584d18ed222ca702b89cd8430c3b06b506` (`origin/main`, 2026-10-15).

1. Identity: auth routing, sessions, project ownership, account preferences.
2. Persistence: migrations, RLS, storage, approval/asset immutability.
3. Intake: song upload, replacement safety, local DSP, transcription persistence.
4. Creative state: World lifecycle/report/confirmation plus Style Bible, characters, environments, rules, references, Vision Lock.
5. Direction: Visual Plans, storyboards, scenes, timing, continuity.
6. Orchestration: generation jobs, scheduling, retries, polling, recovery, idempotency.
7. Providers: gateway contracts, image, motion and lip-sync availability/provenance.
8. Output: motion selection, assembly, final-media validation, export/download.
9. Product UI: routes, studio interactions, accessibility, responsive behavior, Arcane preference synchronization.
10. Operations: configuration, tests, build, CI, deployment alignment and observability.

Canonical flow: Song intake -> Reveal World -> Visual World Report -> creator confirmation -> Style Bible -> Characters -> Environments -> Visual Rules -> References -> Storyboard -> Scenes -> Motion -> Final Video.
