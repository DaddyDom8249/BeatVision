# Production CORS release receipt — 2026-10-27

Exact-source branch head: `3a9064fa7477a19586aa9825d015b8e6030be152`, [PR #159](https://github.com/DaddyDom8249/BeatVision/pull/159).

Source-parity CI: [607/607 PASS](https://github.com/DaddyDom8249/BeatVision/actions/runs/40586740825). The isolated database replay was independently running, although this CORS-only release contains no migrations.

After comparing each live file against its checked-in baseline, six functions were deployed and each read back as **ACTIVE**, with exactly the expected one-line entrypoint and unchanged JWT setting:

- beatvision-generation: v72 to **v73**, five relative dependencies unchanged
- beatvision-ai-director: v6 to **v7**
- beatvision-song-interpretation: v6 to **v7**
- beatvision-world: v62 to **v63**
- beatvision-analyze-song: v44 to **v45**
- beatvision-style-draft: v30 to **v31**

Live origin preflight verification is performed by `scripts/smoke/verify-edge-cors.mjs` in the new push workflow, which sends unauthenticated **OPTIONS only** and never starts provider inference.

Rollback: redeploy each corresponding `baseline/index.ts` with original dependencies and JWT policy; current deploy state must be inspected first. No media batches should be resumed as part of rollback.
