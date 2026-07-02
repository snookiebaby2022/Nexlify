#!/usr/bin/env bash
# Exit 0 when .next looks like a completed production build.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .next/standalone/server.js ]; then
  exit 0
fi
if [ -f .next/BUILD_ID ] && [ -f .next/prerender-manifest.json ]; then
  exit 0
fi
if [ -f .next/BUILD_ID ] && [ -d .next/server ]; then
  exit 0
fi
exit 1
