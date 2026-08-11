#!/usr/bin/env bash
# Ensure local tsx is installed (nexlify-cron + update worker require it at runtime).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f node_modules/tsx/dist/cli.mjs ]; then
  echo "ensure-tsx: OK"
  exit 0
fi

echo "ensure-tsx: installing tsx (required for nexlify-cron) ..."
npm install tsx@4.19.4 --no-audit --no-fund --loglevel=error --save \
  || npm install tsx@4.19.4 --no-audit --no-fund --loglevel=error

if [ ! -f node_modules/tsx/dist/cli.mjs ]; then
  echo "ERROR: tsx still missing after install — check disk space and network" >&2
  exit 1
fi

echo "ensure-tsx: OK"
