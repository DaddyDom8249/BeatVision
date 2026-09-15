#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKER="$ROOT/cloudflare-ai-worker/src/index.ts"

if [[ ! -f "$WORKER" ]]; then
  echo "BeatVision content guard: worker missing"
  exit 1
fi

# These strings belong to an old test song/world and must never be embedded in
# the production image-generation worker. Runtime project context must come
# from the current BeatVision project instead.
FORBIDDEN_REGEX='Drain Rack Halo|LKQ pick-your-part|LKQ Pick Your Part|Alabama auto salvage yard|female salvage-yard worker|beatvision_lkq_song_world'

if grep -Eiq "$FORBIDDEN_REGEX" "$WORKER"; then
  echo "BeatVision content guard FAILED: hardcoded test-world content found in image worker."
  grep -Ein "$FORBIDDEN_REGEX" "$WORKER" || true
  exit 1
fi

echo "BeatVision content guard: PASS"
