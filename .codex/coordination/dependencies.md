# Dependencies

## Workspace corrective release — 2026-10-16

- Frontend-only patch at main base `9efe1326bc38c25c351cec070e00082c3fb11304`; release retains merged PR #111 UI repairs. No Edge deployment is coupled to these display changes.
- Live World/Style/analyzer dedicated-key code is published separately in PR #112 and is absent from this main-base frontend branch. Do not redeploy its older language-function files over that live repair.
- New image/assembly dispatch remains unavailable. Current free-plan proof and removal of Arena's unknown-cost Pixazo-first path are prerequisites to enabling images; assembly has its own unresolved execution-cost boundary. No billing/secret/provider settings are changed by this patch.

- Shared-interface, migration, and cross-subsystem changes route through lead Codex.
- Persistence owns SQL/RLS/storage invariants; creative/output agents may report dependencies but do not edit migrations.
- Orchestration owns generation controller; output owns UI/final-media callers and coordinates controller contract changes.
- Identity/UI owns PR #108 preference synchronization; no wholesale PR merge is authorized.
