#!/usr/bin/env bash

# Fail deploy if standalone server exists but static assets were not copied.

set -euo pipefail

cd "$(dirname "$0")/.."

ROOT="$(pwd)"

DIST="${NEXLIFY_DIST_DIR:-.next}"



STANDALONE="$ROOT/$DIST/standalone"

if [ ! -f "$STANDALONE/server.js" ]; then

  echo "verify-standalone: no standalone server.js — skip"

  exit 0

fi



CHUNK_DIR="$STANDALONE/.next/static/chunks"

if [ ! -d "$CHUNK_DIR" ]; then

  echo "ERROR: $CHUNK_DIR missing — run: bash scripts/prepare-standalone.sh"

  exit 1

fi



COUNT="$(find "$CHUNK_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"

if [ "${COUNT:-0}" -lt 1 ]; then

  echo "ERROR: standalone has 0 JS chunks — run: bash scripts/prepare-standalone.sh"

  exit 1

fi



if [ ! -d "$STANDALONE/public" ]; then

  echo "WARN: standalone/public missing"

fi



echo "verify-standalone: OK ($COUNT chunk files)"

