# BeatVision Phase Execution Skill

Implement one coherent phase at a time. Preserve unrelated working infrastructure.

## Before changing code

1. Read the product requirements.
2. Inspect the current implementation.
3. Inspect data models and migrations.
4. Inspect provider interfaces and actual implementations.
5. Inspect existing tests and rules.
6. Identify what already works and what must not change.

## Implementation

- Reuse existing infrastructure before introducing alternatives.
- Do not create competing state machines or duplicate models.
- Do not create placeholder UI that claims to perform work.
- Preserve real media and existing user data.
- Keep provider failures explicit.
- Keep changes incremental and reversible.

## Verification loop

Inspect → implement → typecheck/build → tests → browser verification → persistence verification where relevant → inspect failures → fix → repeat.

A phase is not complete merely because code was committed.
