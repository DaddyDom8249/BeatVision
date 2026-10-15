# Dependencies

- Shared-interface, migration, and cross-subsystem changes route through lead Codex.
- Persistence owns SQL/RLS/storage invariants; creative/output agents may report dependencies but do not edit migrations.
- Orchestration owns generation controller; output owns UI/final-media callers and coordinates controller contract changes.
- Identity/UI owns PR #108 preference synchronization; no wholesale PR merge is authorized.
