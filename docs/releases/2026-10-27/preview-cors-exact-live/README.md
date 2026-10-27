# Exact deployed preview CORS release

The six baseline files were read from active Supabase production on 2026-10-27. Each release file differs **only** by the one added exact origin `https://beat-vision-kfk4sh067-beat-vision.vercel.app` to the existing static allowlist. The manifest records original deployed function version, bundle hash, JWT policy and dependency file names. The original v72 generation controller from production is used, not the nine-hunk-divergent feature branch controller.

Before deployment re-read production, compare all current files byte-for-byte with these baselines, stop on drift, preserve all dependency files and JWT flags, and verify in authenticated browser after deployment. The source regression `scripts/test/release-cors-live-parity.test.mjs` enforces exact single-line patching. Existing batches stay paused, no AI jobs or creative approvals are touched. Roll back by deploying baseline files if verified runtime differs from expected.
