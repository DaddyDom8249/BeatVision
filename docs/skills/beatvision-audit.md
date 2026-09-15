# BeatVision Audit Skill

**Source:** adapted from beatvision-grok's repository-audit skill.

An audit must inspect actual implementation, not filenames, comments, documentation, or intended architecture.

## Audit dimensions

- Product workflow: song intake, Reveal World, world report, approval, style bible, characters, environments, references, storyboard, scenes, motion, final video.
- Persistence: project data, audio, generated media, versions, refresh/restart behavior, project scoping.
- Timeline: actual song duration, deterministic scene timing, full coverage, no unexplained gaps/overlaps, no silent media recycling.
- Generation: provider interface, implementation, credentials, real output, failure behavior, fallback behavior.
- Security: ownership/RLS, public storage, exposed secrets, untrusted URLs, cross-project access.
- Code quality: duplicate state systems, dead code, fake implementations, unreachable routes, brittle parsing, oversized components.
- Verification: typecheck, tests, build, browser smoke, mobile smoke where UI changed, persistence checks where state changed.

## Verdicts

Use only: `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`.

Never call a feature complete until its actual behavior has been verified.

## Cross-repository rule

When comparing BeatVision repositories, use them as evidence sources only. Do not modify source repositories during the audit. Only the explicitly selected target repository may receive implementation changes.
