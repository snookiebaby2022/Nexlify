#!/usr/bin/env bash
# Ensure the @prisma/client package AND generated engine exist.
# The update worker loads src/lib/prisma.ts via tsx — leftover
# node_modules/.prisma/client is not enough if @prisma/client was wiped
# by a failed npm ci (npm ci deletes node_modules first).
set -euo pipefail
cd "$(dirname "$0")/.."

prisma_pkg_ok() {
  [ -f node_modules/@prisma/client/package.json ]
}

prisma_generated_ok() {
  [ -f node_modules/.prisma/client/index.js ]
}

if prisma_pkg_ok && prisma_generated_ok; then
  echo "ensure-prisma-client: OK"
  exit 0
fi

if ! prisma_pkg_ok; then
  echo "ensure-prisma-client: @prisma/client missing — installing deps ..."
  npm ci --include=dev --include=optional --no-audit --no-fund --loglevel=error \
    || npm install --include=dev --include=optional --no-audit --no-fund --loglevel=error
fi

echo "==> Generating Prisma client ..."
unset DATABASE_URL 2>/dev/null || true
npx prisma generate

if ! prisma_pkg_ok || ! prisma_generated_ok; then
  echo "ERROR: @prisma/client still missing after generate" >&2
  exit 1
fi

echo "ensure-prisma-client: OK"
