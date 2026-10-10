# Grok Handoff

Status: UPDATED: CANONICAL REPOSITORY CONFIRMED

## Required initialization

Grok should independently inspect the repository and this protocol.

Required checks:

1. Confirm repository and baseline branch. The canonical repository is **`DaddyDom8249/BeatVision`**.
2. Confirm the current HEAD commit in `DaddyDom8249/BeatVision`.
3. Read `AGENTS.md`.
4. Read `.agents/PROTOCOL.md`.
5. Review `.agents/STATE.md`.
6. Create a separate `agent/grok-*` branch from the same baseline used by ChatGPT.
7. Record the branch and baseline SHA here.
8. Independently identify the highest-priority reproducible blocker.
9. Do not trust historical claims without current evidence.

## Grok review template

### Baseline

- Repository:
- Branch:
- Commit SHA:

### Independent findings

- CONFIRMED:
- FAILED:
- UNVERIFIED:
- BLOCKED:

### Highest-priority blocker

- Symptom:
- Reproduction:
- Evidence:
- Suspected root cause:
- Confidence:

### Review of ChatGPT work

- Correct:
- Incorrect:
- Missing:
- Security concerns:
- Regression concerns:

### Required next action

State exactly one next engineering action.

## Canonical repository rule

**All application work belongs in `DaddyDom8249/BeatVision`. Do not use a separate `BeatVision-1` / `beatvision-1` repository as the application source of truth.** Any `beatvision-1` controller/import copy is coordination-only. Do not scaffold a competing application, split fixes across repositories, or treat the controller copy as canonical.

When creating Grok's working branch, branch it from the agreed baseline in `DaddyDom8249/BeatVision`. All review findings and proposed application changes must be traceable back to that repository.

## Rule

Grok must independently complete the checks above before making application changes.