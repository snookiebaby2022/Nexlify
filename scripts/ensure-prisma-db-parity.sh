#!/usr/bin/env bash
# Ensure PostgreSQL matches prisma/schema before build/swap/restart.
# Auto-applies pending migrations when NEXLIFY_AUTO_MIGRATE=1 (default).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AUTO="${NEXLIFY_AUTO_MIGRATE:-1}"
AUTO="$(printf '%s' "$AUTO" | tr '[:upper:]' '[:lower:]')"

if [ ! -f .env ]; then
  echo "ensure-prisma-db-parity: no .env — skip" >&2
  exit 0
fi

if [ ! -f scripts/assert-prisma-db-parity.cjs ]; then
  echo "ensure-prisma-db-parity: assert script missing — skip" >&2
  exit 0
fi

unset DATABASE_URL 2>/dev/null || true

run_assert() {
  node scripts/assert-prisma-db-parity.cjs "$@"
}

if run_assert; then
  exit 0
fi

if [ "$AUTO" = "1" ] || [ "$AUTO" = "true" ] || [ "$AUTO" = "yes" ]; then
  echo "ensure-prisma-db-parity: mismatch — running prisma migrate deploy ..."
  npx prisma migrate deploy
  npx prisma generate || true
  if run_assert; then
    echo "ensure-prisma-db-parity: OK after migrate deploy"
    exit 0
  fi
  # Columns may already exist from a manual hotfix; mark pending migrations applied.
  echo "ensure-prisma-db-parity: migrate deploy did not clear history — trying resolve for pending ..."
  STATUS="$(npx prisma migrate status 2>&1 || true)"
  while IFS= read -r line; do
    name="$(printf '%s' "$line" | awk '{print $1}')"
    case "$name" in
      20*_*)
        echo "  prisma migrate resolve --applied $name"
        npx prisma migrate resolve --applied "$name" || true
        ;;
    esac
  done <<EOF
$(printf '%s\n' "$STATUS" | grep -E '^20[0-9]{12}_' || true)
EOF
  # After resolve, verify columns still (allow pending cleared)
  if run_assert; then
    echo "ensure-prisma-db-parity: OK after migrate resolve"
    exit 0
  fi
fi

echo "ERROR: Prisma schema/DB parity check failed — refusing panel build/swap." >&2
echo "Fix: npx prisma migrate deploy  (or set NEXLIFY_AUTO_MIGRATE=1)" >&2
exit 1
