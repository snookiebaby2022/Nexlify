#!/usr/bin/env bash
# PostgreSQL streaming replica bootstrap (panel server = primary).
# Run on PRIMARY first, then on REPLICA with REPLICA=1.
#
# Primary:
#   bash scripts/install-postgres-read-replica.sh
#
# Replica:
#   PRIMARY_HOST=panel-ip REPLICA=1 bash scripts/install-postgres-read-replica.sh
set -euo pipefail
log() { echo "[pg-replica] $*"; }

PRIMARY_HOST="${PRIMARY_HOST:-127.0.0.1}"
REPLICA="${REPLICA:-0}"
REPL_USER="${REPL_USER:-replicator}"
REPL_PASS="${REPL_PASS:-$(openssl rand -hex 16 2>/dev/null || echo changeme)}"
PG_VER="${PG_VER:-$(psql --version 2>/dev/null | grep -oE '[0-9]+' | head -1)}"
PG_DATA="${PG_DATA:-/var/lib/postgresql/${PG_VER}/main}"

if [ "$REPLICA" != "1" ]; then
  log "PRIMARY mode — enable replication user"
  if ! command -v psql >/dev/null 2>&1; then
    log "ERROR: install postgresql on primary"
    exit 1
  fi
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${REPL_USER}') THEN
    CREATE ROLE ${REPL_USER} WITH REPLICATION LOGIN PASSWORD '${REPL_PASS}';
  END IF;
END\$\$;
SQL
  log "replicator password: ${REPL_PASS}"
  log "Add to postgresql.conf: wal_level=replica, max_wal_senders=5, hot_standby=on"
  log "Add to pg_hba.conf: host replication ${REPL_USER} REPLICA_IP/32 scram-sha-256"
  log "Then restart postgres and run on replica: PRIMARY_HOST=${PRIMARY_HOST} REPLICA=1 REPL_PASS=${REPL_PASS} bash $0"
  exit 0
fi

log "REPLICA mode — streaming from ${PRIMARY_HOST}"
if [ ! -d "$PG_DATA" ]; then
  log "ERROR: PG_DATA $PG_DATA not found — install postgres on replica first"
  exit 1
fi

systemctl stop postgresql 2>/dev/null || systemctl stop postgresql@${PG_VER}-main 2>/dev/null || true
rm -rf "${PG_DATA}"/*
sudo -u postgres PGPASSWORD="${REPL_PASS}" pg_basebackup -h "$PRIMARY_HOST" -D "$PG_DATA" -U "$REPL_USER" -Fp -Xs -P -R
systemctl start postgresql 2>/dev/null || systemctl start postgresql@${PG_VER}-main 2>/dev/null || true
log "Replica started — set DATABASE_READ_URL on panel for reporting queries"
