#!/usr/bin/env bash
# Fail fast when Prisma schema and PostgreSQL are out of sync (prevents login/API breakage).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "verify-db-schema: no .env — skip" >&2
  exit 0
fi

if ! command -v npx >/dev/null 2>&1 || [ ! -d prisma/migrations ]; then
  echo "verify-db-schema: prisma/migrations missing — skip" >&2
  exit 0
fi

echo "==> verify-db-schema: prisma migrate status"
STATUS="$(npx prisma migrate status 2>&1)" || {
  echo "$STATUS" >&2
  echo "ERROR: prisma migrate status failed" >&2
  exit 1
}
echo "$STATUS"
if echo "$STATUS" | grep -qiE 'following migrations have not yet been applied|Database schema is not up to date'; then
  echo "ERROR: pending Prisma migrations — run: npx prisma migrate deploy" >&2
  exit 1
fi

echo "==> verify-db-schema: required columns + schema parity"
node scripts/audit-db-schema.cjs
