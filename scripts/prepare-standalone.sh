#!/usr/bin/env bash

# Copy static assets into standalone after next build (required for output: standalone).

set -euo pipefail

cd "$(dirname "$0")/.."

DIST=".next"

if [ ! -f "$DIST/standalone/server.js" ]; then
  echo "prepare-standalone: no $DIST/standalone/server.js -- skip"
  exit 0
fi

mkdir -p "$DIST/standalone/.next"
if [ -d "$DIST/static" ]; then
  rm -rf "$DIST/standalone/.next/static"
  cp -a "$DIST/static" "$DIST/standalone/.next/static"
fi
if [ -d public ]; then
  rm -rf "$DIST/standalone/public"
  cp -a public "$DIST/standalone/public"
fi

# Copy package.json so the version API can read it
if [ -f package.json ] && [ ! -f "$DIST/standalone/package.json" ]; then
  cp package.json "$DIST/standalone/package.json"
fi

# Remove PANEL_REPO_PATH from standalone .env — ecosystem.config.cjs sets it at runtime via __dirname
# This prevents build-time paths (e.g. /home/nexlify-panel) from breaking on customer servers
if [ -f "$DIST/standalone/.env" ]; then
  sed -i '/^PANEL_REPO_PATH=/d' "$DIST/standalone/.env"
fi

echo "prepare-standalone: OK ($DIST/static + public + package.json copied, PANEL_REPO_PATH cleaned)"
