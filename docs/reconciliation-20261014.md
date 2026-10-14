# Reconciliation checkpoint (2026-10-14)

This merge reconciles main (9e6619f) with the later production recovery (7b77f329). Both parents are preserved in the merge commit. The resolution takes the later production source as the baseline, copies main-only integration evidence and tests, and restores main-only plan-wide final-assembly gating. It also disables the known-failing Wan request button (upstream 503 WAN_ELIGIBILITY_UNVERIFIED). No approved assets, database rows, credentials, provider settings or production deployments are changed by this source commit.

**Proof needed**: complete CI, Vite build, production auth/integration verification, before final merge. Do not mistake source success for full video success. Zero additional-cost policy remains mandatory.
