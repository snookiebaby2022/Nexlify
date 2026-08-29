#!/usr/bin/env bash
# Guard + backup server 75 before hardening. Never run on other hosts.
set -euo pipefail

HOST=$(hostname -I | awk '{print $1}')
test "$HOST" = '75.119.137.174' || { echo "ABORT wrong host: $HOST"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="/opt/nexlify-panel-backups/pre-harden-${STAMP}"
mkdir -p "$BACKUP"

echo "backup_dir=$BACKUP"

sudo -u postgres pg_dump -Fc nexlify > "$BACKUP/nexlify.dump"
cp -a /opt/nexlify-panel/.env "$BACKUP/env"
cp -a /root/.pm2/dump.pm2 "$BACKUP/pm2.dump.pm2" 2>/dev/null || true
tar -czf "$BACKUP/nginx-config.tgz" /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/nginx/rtmp.d 2>/dev/null || true
tar -czf "$BACKUP/nexlify-panel-src.tgz" -C /opt nexlify-panel/src nexlify-panel/scripts nexlify-panel/ecosystem.config.cjs nexlify-panel/prisma nexlify-panel/package.json 2>/dev/null || true
test -d /opt/nexlify-panel/.next && tar -czf "$BACKUP/nexlify-panel-next.tgz" -C /opt/nexlify-panel .next || true

# Baseline health snapshot
{
  echo "=== baseline ${STAMP} ==="
  date -Is
  ss -lntp
  pm2 jlist 2>/dev/null || true
  df -h
  free -m
} > "$BACKUP/baseline.txt"

sha256sum "$BACKUP"/* > "$BACKUP/checksums.sha256" 2>/dev/null || true
echo "backup_ok"
