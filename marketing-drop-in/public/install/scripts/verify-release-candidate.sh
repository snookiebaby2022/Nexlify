#!/usr/bin/env bash
# Vendor pre-publish gate — panel must build cleanly before a release ships to customers.
# Run on vendor VPS before vps-fix-everything publish step, or in CI.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "=== verify-release-candidate (panel v$(node -p "require('./package.json').version")) ==="

export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
export NEXT_PRIVATE_WORKER_THREADS=false

echo "-> npm run build ..."
if ! npm run build; then
  echo "ERROR: release candidate build failed — do NOT publish to customers" >&2
  exit 1
fi

echo "-> prepare-standalone + verify ..."
bash scripts/prepare-standalone.sh
bash scripts/verify-standalone.sh

CHUNKS="$(find .next/standalone/.next/static/chunks -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
CSS="$(find .next/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
if [ "${CHUNKS:-0}" -lt 10 ]; then
  echo "ERROR: too few JS chunks ($CHUNKS) — abort publish" >&2
  exit 1
fi
if [ "${CSS:-0}" -lt 1 ]; then
  echo "ERROR: no CSS bundles — abort publish" >&2
  exit 1
fi

echo "=== verify-release-candidate OK ($CHUNKS chunks, $CSS CSS) ==="
