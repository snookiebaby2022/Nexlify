#!/usr/bin/env bash

# Copy static assets into standalone after next build (required for output: standalone).
# This script runs automatically after every build (postbuild hook) and before PM2 start.

set -euo pipefail

cd "$(dirname "$0")/.."
PANEL_ROOT="$(pwd)"

DIST="${NEXLIFY_DIST_DIR:-.next}"

if [ ! -f "$DIST/standalone/server.js" ]; then
  echo "prepare-standalone: no $DIST/standalone/server.js -- skip"
  exit 0
fi

mkdir -p "$DIST/standalone/.next"

# Clean cache and diagnostics from standalone/.next/ (leftover from previous builds)
rm -rf "$DIST/standalone/.next/cache" "$DIST/standalone/.next/diagnostics" 2>/dev/null || true

# Clean bloat that next build copies into standalone (dist/, downloads/, marketing-drop-in/, etc.)
# The standalone server only needs server.js, node_modules/, .next/, public/, package.json, .env
for d in dist downloads marketing-drop-in src docs windows scripts prisma \
         .git backups .next.zip .next.backup .next.staging .next.old; do
  rm -rf "$DIST/standalone/$d" 2>/dev/null || true
done
# Nested standalone/.next/standalone (or deeper) from NFT tracing prior builds — drop it
rm -rf "$DIST/standalone/.next/standalone" "$DIST/standalone/.next/.next" 2>/dev/null || true
# Remove stale lock files and non-essential root files
rm -f "$DIST/standalone/package-lock.json" "$DIST/standalone/.gitignore" 2>/dev/null || true

# Copy all files the standalone server needs from .next/ into standalone/.next/
# The standalone server.js sets distDir: "./.next" and runs from standalone/,
# so it needs BUILD_ID, manifests, server/ etc. inside standalone/.next/.
for f in BUILD_ID routes-manifest.json build-manifest.json prerender-manifest.json \
         required-server-files.json react-loadable-manifest.json \
         app-build-manifest.json app-path-routes-manifest.json \
         next-minimal-server.js.nft.json next-server.js.nft.json \
         package.json export-marker.json images-manifest.json; do
  if [ -f "$DIST/$f" ]; then
    cp -f "$DIST/$f" "$DIST/standalone/.next/$f"
  fi
done
# Copy types/ directory if present
if [ -d "$DIST/types" ]; then
  rm -rf "$DIST/standalone/.next/types"
  cp -a "$DIST/types" "$DIST/standalone/.next/types"
fi
# Copy server/ directory (pages-manifest.json etc. needed at runtime)
if [ -d "$DIST/server" ]; then
  rm -rf "$DIST/standalone/.next/server"
  cp -a "$DIST/server" "$DIST/standalone/.next/server"
fi

# Copy static assets (CSS, JS chunks, images)
if [ -d "$DIST/static" ]; then
  rm -rf "$DIST/standalone/.next/static"
  cp -a "$DIST/static" "$DIST/standalone/.next/static"
  echo "prepare-standalone: copied $DIST/static ($(du -sh "$DIST/static" 2>/dev/null | cut -f1))"
else
  echo "prepare-standalone: WARN no $DIST/static directory found"
fi

# Copy public assets
if [ -d public ]; then
  rm -rf "$DIST/standalone/public"
  cp -a public "$DIST/standalone/public"
fi

# Copy package.json so the version API can read it
if [ -f package.json ]; then
  cp package.json "$DIST/standalone/package.json"
fi

# Ensure standalone has live .env (DATABASE_URL, JWT, license keys)
if [ -f .env ]; then
  cp -f .env "$DIST/standalone/.env"
fi

# Standalone PM2 cwd must resolve repo path to install root, not .next/standalone
if [ -f "$DIST/standalone/.env" ]; then
  sed -i '/^PANEL_REPO_PATH=/d' "$DIST/standalone/.env" 2>/dev/null || true
  echo "PANEL_REPO_PATH=$PANEL_ROOT" >> "$DIST/standalone/.env"
fi

# Stale scripts/ in standalone break the update worker (no src/ for module imports)
rm -rf "$DIST/standalone/scripts" 2>/dev/null || true

# Staging builds bake distDir=./.next.staging and may nest the server tree there.
# Normalize to ./.next before swap/restart so /_next/static never 404s.
if [ -x "$PANEL_ROOT/scripts/fix-next-distdir-references.sh" ]; then
  bash "$PANEL_ROOT/scripts/fix-next-distdir-references.sh" "$PANEL_ROOT/$DIST"
fi

# Verify static assets were copied (fail-safe) — after distdir normalize
if [ ! -d "$DIST/standalone/.next/static" ]; then
  echo "prepare-standalone: ERROR static assets missing after copy!"
  exit 1
fi

if [ -f "$DIST/standalone/server.js" ] && grep -q '\.next\.staging' "$DIST/standalone/server.js" 2>/dev/null; then
  echo "prepare-standalone: ERROR server.js still references .next.staging" >&2
  exit 1
fi

echo "prepare-standalone: OK ($DIST/static + public + package.json copied, PANEL_REPO_PATH=$PANEL_ROOT, standalone/scripts removed)"
