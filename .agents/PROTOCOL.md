# BeatVision-1 Dual-Agent Engineering Protocol

## Purpose

This repository is the shared engineering source of truth for a two-agent repair loop:

- **ChatGPT**: lead implementation, architecture, debugging, integration, and release engineering.
- **Grok**: independent senior reviewer, adversarial debugger, alternative diagnosis, and verification.
- **Git + tests + runtime evidence**: authority over both agents.

The agents must never treat another agent's claim as proof.

## Non-negotiable rules

1. Inspect current repository state before changing anything.
2. Never invent test results, deployment state, API responses, database state, or provider behavior.
3. Never expose or commit secrets.
4. Never weaken authentication or RLS.
5. Never add paid or unknown-cost providers without explicit owner approval.
6. Never delete production data without explicit owner approval.
7. Preserve approved creative state and asset immutability.
8. Make the smallest safe change that fixes the actual root cause.
9. Add regression coverage when practical.
10. Verify the affected workflow, not merely the build.
11. Record evidence and uncertainty.
12. If evidence conflicts, stop the merge and investigate.

## Status vocabulary

Use only:

- VERIFIED
- UNVERIFIED
- FAILED
- BLOCKED

Never use "probably fixed", "should work", or "ready" without evidence.

## Handoff lifecycle

Each task follows:

```
OBSERVE
  ↓
REPRODUCE
  ↓
DIAGNOSE
  ↓
IMPLEMENT
  ↓
TEST
  ↓
ADVERSARIAL REVIEW
  ↓
VERIFY
  ↓
MERGE GATE
```

### ChatGPT implementation packet

When ChatGPT changes code, it must leave:

- objective
- root-cause hypothesis
- files changed
- exact behavior changed
- tests run
- test results
- deployment status
- runtime verification status
- remaining uncertainty
- next blocker

### Grok review packet

Grok must independently inspect the diff and answer:

- Does the proposed root cause match the evidence?
- Is there a smaller/safer fix?
- What regression could this introduce?
- Are there missing tests?
- Are security/auth/RLS boundaries preserved?
- Are provider and cost constraints preserved?
- Does the change violate any BeatVision invariant?
- What evidence is still missing?

Grok must classify the result as VERIFIED, FAILED, UNVERIFIED, or BLOCKED.

## Branch discipline

Preferred branches:

- `main`: release/source-of-truth branch
- `agent/chatgpt-*`: ChatGPT work
- `agent/grok-*`: Grok work
- `agent/shared-*`: explicitly coordinated shared changes

Do not directly rewrite another agent's branch.

Use pull requests for reviewed changes.

## Conflict resolution

If ChatGPT and Grok disagree:

1. Do not choose by model authority.
2. Identify the disputed factual claim.
3. Produce a reproducible test or inspect authoritative runtime evidence.
4. Update the protocol/state record.
5. Proceed only after the evidence resolves the disagreement.

## Canonical shared files

- `.agents/PROTOCOL.md` — operating contract
- `.agents/STATE.md` — current verified project state
- `.agents/HANDOFF_CHATGPT.md` — ChatGPT's current work packet
- `.agents/HANDOFF_GROK.md` — Grok's current review packet
- `PROJECT_LOG.md` — permanent engineering history

## BeatVision invariants

The database is authoritative for durable state.

Creative flow remains:

Song → Analysis → World → Style → Vision Lock → Scene Direction → Generation → Approval → Motion → Timeline → Final Output

World confirmation is a real gate. Approved assets cannot be silently replaced. Generation providers do not own creative state. Arena is the generation bridge. Only free/approved generation paths are permitted.

## Merge gate

A change may merge only when:

- relevant tests pass
- security constraints remain intact
- no secret is exposed
- no paid/unknown-cost path was introduced
- the changed workflow is verified when verification is available
- Grok has reviewed the change OR the owner explicitly waives independent review
- unresolved limitations are recorded

If live verification is unavailable, the result remains UNVERIFIED or BLOCKED.