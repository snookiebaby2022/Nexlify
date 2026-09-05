#!/usr/bin/env bash
# Build a pre-built archive for customer auto-updates: .next runtime + versioned scripts overlay.
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

cd "$ROOT"
PACK="$(mktemp -d)"
cleanup_pack() { rm -rf "$PACK"; }
trap cleanup_pack EXIT

mkdir -p "$PACK"
# .next runtime files at archive root (BUILD_ID next to overlay)
tar -cf - \
  --exclude='cache' \
  --exclude='diagnostics' \
  -C .next \
  BUILD_ID \
  static \
  server \
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
  2>/dev/null | tar -xf - -C "$PACK" || true

OVER="$PACK/_nexlify_overlay/scripts"
mkdir -p "$OVER" "$PACK/_nexlify_overlay/prisma"
for f in \
  playback-topology.sh \
  panel-no-local-iptv-edge.sh \
  apply-live-edge-topology.sh \
  apply-prebuilt-update.sh \
  rematch-iptv-edge-auth.sh \
  install-iptv-edge-proxy.sh \
  pm2-start.sh \
  panel-restart-safe.sh \
  verify-live-no-redirect.sh \
  route-live-to-remote-edge.sh \
  nginx-live-remote-splice.conf.example
do
  if [ -f "$ROOT/scripts/$f" ]; then
    cp -f "$ROOT/scripts/$f" "$OVER/"
  fi
done
if [ -f "$ROOT/prisma/schema.prisma" ]; then
  cp -f "$ROOT/prisma/schema.prisma" "$PACK/_nexlify_overlay/prisma/schema.prisma"
fi
echo "$VER" > "$PACK/_nexlify_overlay/VERSION"

tar -czf "$OUT" -C "$PACK" .
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
