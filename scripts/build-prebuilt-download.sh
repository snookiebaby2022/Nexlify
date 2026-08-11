#!/usr/bin/env bash
# Build a pre-built .next.tar.gz for customer auto-updates.
# This archive contains only the .next directory so it can be swapped in
# without running npm install or npm run build on the customer VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/next-1.9.29.tar.gz}"
VER="${2:-$(node -p "require('$ROOT/package.json').version")}"

if [ -z "${VER:-}" ]; then
  echo "ERROR: Could not determine panel version" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

cd "$ROOT"

if [ ! -f .next/BUILD_ID ]; then
  echo "ERROR: .next/BUILD_ID missing — run npm run build first" >&2
  exit 1
fi

echo "Building prebuilt .next archive: $OUT"
# Only include files needed for production runtime:
# - standalone/  (server.js + required server chunks)
# - static/      (static assets)
# - BUILD_ID and manifest files (for next start fallback)
# Exclude cache/ and diagnostics/ which bloat the archive.
tar -czf "$OUT" \
  --exclude='standalone/.next/cache' \
  --exclude='standalone/.next/diagnostics' \
  --exclude='cache' \
  --exclude='diagnostics' \
  -C .next \
  BUILD_ID \
  standalone \
  static \
  routes-manifest.json \
  build-manifest.json \
  prerender-manifest.json \
  required-server-files.json \
  react-loadable-manifest.json \
  app-build-manifest.json \
  app-path-routes-manifest.json \
  next-minimal-server.js.nft.json \
  next-server.js.nft.json \
  package.json \
  export-marker.json \
  images-manifest.json \
  types \
  2>/dev/null || true

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
