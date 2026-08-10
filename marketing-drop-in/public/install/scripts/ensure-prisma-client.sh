#!/usr/bin/env bash
# Ensure @prisma/client is generated (required for set-admin-password, update worker, panel runtime).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d node_modules/.prisma/client ] && [ -f node_modules/.prisma/client/index.js ]; then
  echo "ensure-prisma-client: OK"
  exit 0
fi

if [ ! -d node_modules/@prisma/client ]; then
  echo "ensure-prisma-client: @prisma/client missing — running npm ci ..."
  npm ci --include=dev --include=optional --no-audit --no-fund --loglevel=error \
    || npm install --include=dev --include=optional --no-audit --no-fund --loglevel=error
fi

echo "==> Generating Prisma client ..."
unset DATABASE_URL 2>/dev/null || true
npx prisma generate

if [ ! -d node_modules/.prisma/client ]; then
  echo "ERROR: prisma generate failed — .prisma/client still missing" >&2
  exit 1
fi

echo "ensure-prisma-client: OK"
