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

echo "prepare-standalone: OK ($DIST/static + public copied)"
