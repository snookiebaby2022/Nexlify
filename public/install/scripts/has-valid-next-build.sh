#!/usr/bin/env bash
# Exit 0 when a Next.js build dir looks like a completed production build.
set -euo pipefail
cd "$(dirname "$0")/.."
DIST="${1:-${NEXLIFY_DIST_DIR:-.next}}"
if [ -f "$DIST/standalone/server.js" ]; then
  exit 0
fi
if [ -f "$DIST/BUILD_ID" ] && [ -f "$DIST/prerender-manifest.json" ]; then
  exit 0
fi
if [ -f "$DIST/BUILD_ID" ] && [ -d "$DIST/server" ]; then
  exit 0
fi
exit 1