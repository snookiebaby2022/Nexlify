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
tar -czf "$OUT" -C .next .
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
