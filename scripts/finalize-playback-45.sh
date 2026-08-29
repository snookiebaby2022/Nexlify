#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel

echo "=== Ensure 10gbs agent token ==="
node scripts/ensure-10gbs-agent-token.cjs

echo "=== Invalidate caches ==="
node scripts/invalidate-playback-cache.cjs 2>/dev/null || true

echo "=== Verify playback ==="
bash scripts/quick-playback-check-45.sh
