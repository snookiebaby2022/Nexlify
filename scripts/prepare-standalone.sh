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

# Verify static assets were copied (fail-safe)
if [ ! -d "$DIST/standalone/.next/static" ]; then
  echo "prepare-standalone: ERROR static assets missing after copy!"
  exit 1
fi

echo "prepare-standalone: OK ($DIST/static + public + package.json copied, PANEL_REPO_PATH=$PANEL_ROOT, standalone/scripts removed)"
