#!/bin/bash
# Post-build smoke tests — fail deploy if site is broken
set -euo pipefail

ROOT="${1:-/var/www/nexlify}"
PORT="${NEXLIFY_WEB_PORT:-13001}"
BASE="http://127.0.0.1:${PORT}"

fail() {
  echo "SMOKE TEST FAILED: $1" >&2
  exit 1
}

if [ -f "$ROOT/src/generated/prisma/client.ts" ]; then
  if grep -q 'findMany: async (_args' "$ROOT/src/generated/prisma/client.ts" 2>/dev/null; then
    fail "Prisma client is still the empty stub"
  fi
fi

if ! find "$ROOT/src/generated/prisma" -name 'libquery_engine*.node' | grep -q .; then
  fail "Prisma query engine missing"
fi

# Marketing uses PostgreSQL in production; fall back to SQLite for local dev.
if [ -f "$ROOT/.env" ] && grep -q '^DATABASE_URL=.*postgres' "$ROOT/.env" 2>/dev/null; then
  if ! (cd "$ROOT" && npx prisma db execute --stdin <<< "SELECT 1;" >/dev/null 2>&1); then
    # Older prisma: try psql via DATABASE_URL
    if ! command -v psql >/dev/null 2>&1; then
      echo "WARN: Postgres DATABASE_URL set but cannot verify DB (skip)"
    else
      DB_URL=$(grep '^DATABASE_URL=' "$ROOT/.env" | cut -d= -f2- | tr -d '"')
      psql "$DB_URL" -c "SELECT 1;" >/dev/null 2>&1 || fail "PostgreSQL database not reachable"
    fi
  fi
elif ! sqlite3 "$ROOT/data/nexlify.db" "SELECT 1 FROM User LIMIT 1;" >/dev/null 2>&1; then
  if ! sqlite3 "$ROOT/prisma/dev.db" "SELECT 1 FROM User LIMIT 1;" >/dev/null 2>&1; then
    fail "Database not readable (no Postgres or SQLite)"
  fi
fi

code_home=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/" || echo 000)
[ "$code_home" = "200" ] || fail "GET / returned $code_home"

code_admin=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/admin" || echo 000)
case "$code_admin" in
  200|302|307|308) ;;
  *) fail "GET /admin returned $code_admin" ;;
esac

code_health=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/health" || echo 000)
[ "$code_health" = "200" ] || fail "GET /api/health returned $code_health"

login_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@nexlify.live","password":"__smoke_wrong__"}' || echo 000)
[ "$login_code" = "401" ] || fail "POST /api/auth/login returned $login_code (expected 401)"

if [ -f "$ROOT/scripts/verify-admin-login.cjs" ]; then
  node "$ROOT/scripts/verify-admin-login.cjs" || fail "admin password verification failed"
fi

# License server (vendor VPS only)
if curl -sf --max-time 5 http://127.0.0.1:8787/health >/dev/null 2>&1; then
  echo "License server health OK"
fi

echo "Smoke tests passed"
