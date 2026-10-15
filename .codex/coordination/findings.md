# Findings

- Baseline checkout is clean `origin/main` at `f2e137584d18ed222ca702b89cd8430c3b06b506`.
- Latest main Production CI and Master Audit are green.
- PR #108 (`65acf316f44ef7cb1e3b0edc6633761b7dbc06a3`) is mergeable but UNSTABLE.
- PR #108 review confirms same-user auth events can overwrite an unsaved Arcane preference after `updateUser` failure and clear retry state.
- PR #108 latest CI failed during `npm install`: registry had no matching `@supabase/auth-js@2.118.0`; database/security workflows passed. Treat separately from product repair until locally reproduced/current registry state is known.
- Local baseline dependency install now succeeds and resolves `@supabase/supabase-js@2.118.0` -> `@supabase/auth-js@2.118.0`; the PR CI install failure is not currently reproducible.
- Baseline `npm test`: 261/261 pass, exit 0.
- Nested integration suite: 6/6 pass, exit 0.
- `npm run production-audit`: pass, exit 0.
- `npm run build`: pass, exit 0; existing Vite large-chunk warning (908.50 kB JS) remains.
- Identity specialist reproduced PR #108 review failure before repair and passed the focused retry regression afterward; live preference sync remains NOT VERIFIED.
- Creative specialist confirmed a stale World pointer restoration omitted `world_confirmed_at`; repair is integrated and focused lineage tests pass.
- Direction specialist confirmed revision creation discarded returned draft ID; repair is integrated and focused plan tests pass.
- Intake specialist confirmed terminal DSP boundary could create a zero-length section and analysis refresh reused page saving state; both repairs are integrated.
- Orchestration specialist confirmed oldest-first drain could starve queued jobs behind eight active jobs; bounded queued/active drain repair is integrated.
- Output specialist could not run due execution usage limit; no output change is claimed from that lane.
