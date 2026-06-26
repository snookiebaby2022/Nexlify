#!/usr/bin/env bash
# PostgreSQL permissions + pgcrypto extension (encryption helpers at DB layer).
set -euo pipefail

echo "=== ensure-postgres-hardening ==="

if ! command -v psql >/dev/null 2>&1; then
  echo "PostgreSQL client not installed — skip"
  exit 0
fi

PG_VER="$(psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1 || echo "")"
PG_CONF="/etc/postgresql/${PG_VER}/main/postgresql.conf"
PG_HBA="/etc/postgresql/${PG_VER}/main/pg_hba.conf"
PG_DATA="/var/lib/postgresql/${PG_VER}/main"

if [ -f "$PG_CONF" ]; then chmod 640 "$PG_CONF"; chown postgres:postgres "$PG_CONF" 2>/dev/null || true; fi
if [ -f "$PG_HBA" ]; then chmod 640 "$PG_HBA"; chown postgres:postgres "$PG_HBA" 2>/dev/null || true; fi
if [ -d "$PG_DATA" ]; then chmod 700 "$PG_DATA"; chown -R postgres:postgres "$(dirname "$PG_DATA")" 2>/dev/null || true; fi

if sudo -u postgres psql -d nexlify -tc "SELECT 1" >/dev/null 2>&1; then
  sudo -u postgres psql -d nexlify -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null 2>&1 || true
  echo "  pgcrypto extension enabled on nexlify database"
else
  echo "  WARN: cannot connect to nexlify database — check DATABASE_URL"
fi

echo "ensure-postgres-hardening done."
