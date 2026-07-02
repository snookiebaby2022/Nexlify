#!/bin/bash
# Canonical marketing site build on VPS — run after patch-marketing-full.py
set -euo pipefail

ROOT="${NEXLIFY_MARKETING_PATH:-/var/www/nexlify}"
cd "$ROOT"

echo "=== Nexlify marketing deploy (build) ==="

if [ ! -f .env ]; then
  echo "ERROR: $ROOT/.env missing — create it on the server; deploy never ships .env files." >&2
  exit 1
fi

if ! grep -q '^JWT_SECRET=.\{32,\}' .env 2>/dev/null; then
  echo "ERROR: JWT_SECRET missing or too short in $ROOT/.env" >&2
  exit 1
fi

if ! grep -q '^DATABASE_URL=' .env 2>/dev/null; then
  echo "ERROR: DATABASE_URL missing in $ROOT/.env" >&2
  exit 1
fi

if ! grep -q '^ADMIN_PASSWORD=.\{8,\}' .env 2>/dev/null; then
  echo "ERROR: ADMIN_PASSWORD missing or too short in $ROOT/.env (min 8 chars)" >&2
  exit 1
fi

echo "-> sync panel install env (license sync secret for customer panels)"
if [ -f "$ROOT/scripts/sync-panel-sync-env.sh" ]; then
  bash "$ROOT/scripts/sync-panel-sync-env.sh" "$ROOT" || true
fi

echo "-> sync marketing env (license API, Stripe)"
if [ -f "$ROOT/scripts/sync-marketing-env.py" ]; then
  python3 "$ROOT/scripts/sync-marketing-env.py" || true
fi
if grep -q '^NEXLIFY_LICENSE_API_URL=https://nexlify.live' .env 2>/dev/null; then
  sed -i 's|^NEXLIFY_LICENSE_API_URL=.*|NEXLIFY_LICENSE_API_URL=http://127.0.0.1:8787|' .env
  echo "  Fixed NEXLIFY_LICENSE_API_URL -> http://127.0.0.1:8787"
fi

echo "-> npm install"
npm install --no-audit --no-fund

echo "-> prisma generate"
rm -rf src/generated/prisma
npx prisma generate

ENGINE=$(find src/generated/prisma -name 'libquery_engine*.node' 2>/dev/null | head -1)
if [ -z "$ENGINE" ] || [ ! -f src/generated/prisma/client.ts ]; then
  echo "ERROR: Prisma client not generated (missing engine or client.ts)" >&2
  exit 1
fi
if grep -q 'findMany: async (_args' src/generated/prisma/client.ts 2>/dev/null; then
  echo "ERROR: stub Prisma client detected" >&2
  exit 1
fi
echo "  Prisma OK"

echo "-> sync admin password (ADMIN_PASSWORD in .env)"
node "$ROOT/scripts/sync-marketing-admin.cjs"

echo "-> next build (clean)"
rm -rf .next
npm run build

echo "-> pm2 restart"
pm2 restart nexlify-web --update-env

echo "-> smoke tests"
sleep 2
bash "$ROOT/scripts/marketing-smoke-test.sh" "$ROOT"

pm2 save

echo "=== Deploy complete ==="
