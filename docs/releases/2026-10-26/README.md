# BragoraForge release baseline — 26 October 2026

Production is identified by exact source/deployment IDs, not a moving branch name.
The runtime manifest records the last verified frontend deployment and a byte-exact
snapshot of generation v72. The candidate controller in supabase/functions differs
from that deployed controller; do not deploy it wholesale. Runtime copies here are
audit artifacts, not a second automatically deployed service.

Dependencies are pinned to versions already used for the verified frontend and
installed with a registry-only package-lock.json. An isolated npm ci succeeds and
npm audit reports zero known runtime or development advisories. CI uses npm ci,
checks runtime snapshot hashes and audits runtime dependencies before testing.

Two missing historical rate-limiter migrations were recovered from the production
ledger using their actual versions 20260928053717 and 20260928053824. They restore
fresh-install replay prerequisites; they are NOT re-applied to production. Other
historical version/name differences and the bundled Song Intelligence release are
retained, not rewritten or concealed. Full PostgreSQL migration replay now runs for
stacked pull requests as well as main-targeting pull requests.

Production forward migrations in this work:
- 20261026180038: private legacy buckets, owner-only reads, fixed-purpose atomic
  rate limiter, revoked client counter writes and anonymous image-variant RPC.
- 20261026180757: compatible approved image lookup through the actual ancestor
  chain, preserving project, Vision Lock, timing, appearance and continuity checks.

Verification: all 365 stored object IDs/paths/owners/metadata have the identical
before/after digest. Anonymous HEAD requests for existing files in both legacy
buckets return400. All57 original images are physically present and eligible for
revision5. These findings do not prove an owner has clicked reuse or approved it.

Release procedure:
1. npm ci
2. node scripts/verify-release-snapshot.mjs
3. npm audit --omit=dev --audit-level=high
4. npm test && npm run production-audit && npm run build
5. Inspect exact-head CI and migration replay. Deploy the reviewed exact SHA.
6. Read back Vercel's canonical alias, live function versions/hashes and migration
   ledger. Append a release receipt; never substitute a READY build for user proof.

Do not roll back the security boundary to restore public media. Frontend rollback
must retain generation v72's reuse lineage and durable dispatch guards. No main
merge, secret change, creative approval, inference or automatic batch resume is
part of this release. Physical Modal worker verification remains blocked on the
phone bridge (offline; existing command remains queued).
