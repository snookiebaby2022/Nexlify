#!/usr/bin/env bash
# Nexlify Panel — Quick repair script for common issues
#
# Fixes: login 500 errors, missing server entries, wrong DB credentials
# Usage: sudo bash scripts/repair-panel.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "==> $*"; }

echo "=== Nexlify Panel Repair ==="

# 1. Kill stale update processes
log "Stopping stale update processes..."
pkill -f 'panel-update-background' 2>/dev/null || true
pkill -f 'apply-panel-fast-update' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress

# 2. Fix shell env
log "Clearing stale DATABASE_URL from shell..."
unset DATABASE_URL

# 3. Test and fix DB credentials
log "Testing database connection..."
[ -f .env ] || { echo "ERROR: .env not found"; exit 1; }

DB_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
DB_USER="$(echo "$DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')"
DB_PASS="$(echo "$DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"

if PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h 127.0.0.1 -d nexlify -c "SELECT 1;" >/dev/null 2>&1; then
  log "Database connection OK (user: $DB_USER)"
else
  log "Database connection FAILED — attempting fix..."
  
  # Check if nexlify user exists
  if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='nexlify'" 2>/dev/null | grep -q 1; then
    NEW_PASS="$(openssl rand -hex 16)"
    sudo -u postgres psql -c "ALTER USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@127.0.0.1:5432/nexlify\"|" .env
    log "Reset nexlify password and updated .env"
  else
    NEW_PASS="$(openssl rand -hex 16)"
    sudo -u postgres psql -c "CREATE USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
    sudo -u postgres psql -c "CREATE DATABASE nexlify OWNER nexlify;" 2>/dev/null || true
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE nexlify TO nexlify;" >/dev/null
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@127.0.0.1:5432/nexlify\"|" .env
    log "Created nexlify user and updated .env"
  fi
fi

# 4. Sync Prisma schema
log "Syncing database schema..."
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
npx prisma generate 2>&1 | tail -2
npx prisma db push --accept-data-loss 2>&1 | tail -3

# 5. Check if main server exists
log "Checking main server registration..."
SERVER_COUNT="$(PGPASSWORD="$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')" psql -U "$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')" -h 127.0.0.1 -d nexlify -t -c "SELECT COUNT(*) FROM \"StreamServer\";" 2>/dev/null | tr -d ' ' || echo 0)"

if [ "$SERVER_COUNT" = "0" ]; then
  log "No servers found — registering main server..."
  DOMAIN="$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
  [ -z "$DOMAIN" ] && DOMAIN="$(hostname -f 2>/dev/null || echo 'localhost')"
  npx tsx scripts/ensure-monolithic-server.ts --domain "$DOMAIN" 2>&1 | tail -3
else
  log "Found $SERVER_COUNT server(s) in database"
fi

# 6. Restart panel
log "Restarting panel..."
pm2 restart nexlify --update-env 2>/dev/null || true
pm2 save 2>/dev/null || true

# 7. Verify
sleep 3
PANEL_PORT="$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo 13000)"
health="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PANEL_PORT}/api/health" 2>/dev/null || echo 000)"
login="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -H "User-Agent: Mozilla/5.0" "http://127.0.0.1:${PANEL_PORT}/login" 2>/dev/null || echo 000)"

echo ""
echo "=== Repair Complete ==="
echo " Health:  $health"
echo " Login:   $login"
echo " Version: $(curl -sS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/api/panel/version" 2>/dev/null || echo 'unknown')"
echo ""
if [ "$health" = "200" ]; then
  echo "Panel is running. Test login in your browser."
else
  echo "WARNING: Health check returned $health — check PM2 logs: pm2 logs nexlify"
fi
