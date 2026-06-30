#!/usr/bin/env bash

# Copy static assets into standalone after next build (required for output: standalone).

set -euo pipefail

cd "$(dirname "$0")/.."

DIST="${NEXLIFY_DIST_DIR:-.next}"

if [ ! -f "$DIST/standalone/server.js" ] && [ "$DIST" != ".next" ] && [ -f ".next/standalone/server.js" ]; then
  echo "prepare-standalone: $DIST/standalone missing — using .next"
  DIST=".next"
fi



if [ ! -f "$DIST/standalone/server.js" ]; then

  echo "prepare-standalone: no $DIST/standalone/server.js — skip"

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

if [ -d "$DIST/server" ]; then
  rm -rf "$DIST/standalone/.next/server"
  cp -a "$DIST/server" "$DIST/standalone/.next/server"
fi

if [ -x scripts/fix-next-distdir-references.sh ]; then
  bash scripts/fix-next-distdir-references.sh "$DIST"
fi

if [ -f package.json ]; then
  cp -f package.json "$DIST/standalone/package.json"
fi



echo "prepare-standalone: OK (server + static + public copied)"

