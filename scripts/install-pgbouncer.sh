#!/usr/bin/env bash
# Install PgBouncer in front of PostgreSQL (panel server only).
# Reduces connection churn when many panel workers + cron hit Postgres.
#
#   DB_USER=nexlify DB_PASS=secret DB_NAME=nexlify \
#   bash scripts/install-pgbouncer.sh
#
# Then set DATABASE_URL=postgresql://user:pass@127.0.0.1:6432/dbname?pgbouncer=true
set -euo pipefail

DB_USER="${DB_USER:-nexlify}"
DB_PASS="${DB_PASS:-}"
DB_NAME="${DB_NAME:-nexlify}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
POOL_PORT="${POOL_PORT:-6432}"
POOL_MODE="${POOL_MODE:-transaction}"

if [ -z "$DB_PASS" ]; then
  echo "ERROR: set DB_PASS (and optionally DB_USER DB_NAME)"
  exit 1
fi

if ! command -v pgbouncer >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y pgbouncer
  elif command -v yum >/dev/null 2>&1; then
    yum install -y pgbouncer
  else
    echo "ERROR: install pgbouncer manually"
    exit 1
  fi
fi

mkdir -p /etc/pgbouncer
cat > /etc/pgbouncer/pgbouncer.ini <<INI
[databases]
${DB_NAME} = host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME}

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = ${POOL_PORT}
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = ${POOL_MODE}
max_client_conn = 500
default_pool_size = 25
min_pool_size = 5
reserve_pool_size = 5
server_reset_query = DISCARD ALL
ignore_startup_parameters = extra_float_digits
INI

HASH="$(echo -n "${DB_PASS}${DB_USER}" | md5sum | awk '{print $1}')"
echo "\"${DB_USER}\" \"md5${HASH}\"" > /etc/pgbouncer/userlist.txt
chmod 600 /etc/pgbouncer/userlist.txt

systemctl enable pgbouncer 2>/dev/null || true
systemctl restart pgbouncer

echo "[pgbouncer] listening 127.0.0.1:${POOL_PORT} → ${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo "[pgbouncer] DATABASE_URL=postgresql://${DB_USER}:****@127.0.0.1:${POOL_PORT}/${DB_NAME}?pgbouncer=true"
