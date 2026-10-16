# Workspace evidence — 2026-10-16

Base: `9efe1326bc38c25c351cec070e00082c3fb11304`. Scope: Production Workspace screenshot; lead and two native specialists.

- Live primary frontend: READY `dpl_GWVYyY2SYfc3HGNY1ueiHfQgKBv4`, SHA `eafb6529d6356fe4af05385c8981c334960182d3`; public HTML has device-width viewport. Vercel team remains Hobby.
- Live Generation v33 ACTIVE/custom auth, four source files. Image/assembly refusal matches source; read-only SQL found two failed image attempts with PROVIDER_COST_UNVERIFIED in the previous 24 hours.
- Existing reviewer: actual component reproduced two identical alerts for one failed job and retained private image viewing without enqueue. No edits or external writes.
- Mobile specialist: Chromium 154 with real page/header/CSS and synthetic owner-scoped reads, external network blocked. Normal mobile widths stack without overflow; 980px reproduces desktop proportions. Actual phone setting is unverified.
- Local source safety check: `node --test scripts/test/hf-motion.test.mjs` passed 25/25, exit 0; image/assembly refusal still sends zero network requests.
- Dependency setup: `npm ci` exited 1 because this repository excludes its lockfile. Reused the original verified dependency installation via a temporary worktree symlink; no dependency/source manifest changes.
- Free image eligibility: public Cloudflare docs describe hard-limited Workers Free allocation, but subscription read fails with API 10000 Authentication error. Existing worker has AI binding but its source calls Pixazo first. Neither a binding nor default_usage_model=standard proves a free-only path. No inference request made. Owner's current plan confirmation requested separately.

Focused/full test results, review and exact release fingerprint are recorded in PROJECT_LOG when actually completed.

Handoff accepted after lead diff inspection and independent verification: four implementation/test files only, no persisted-data/backend changes. Specialist full 277/277 plus nested integration 6/6, lead focused 57/57, independent review 71/71; all exit 0, no local browser skips. Build/audit/diff checks pass; production/device/provider success is not inferred. Browser regression requires an installed local Chromium and explicitly skips with NOT VERIFIED when absent.
