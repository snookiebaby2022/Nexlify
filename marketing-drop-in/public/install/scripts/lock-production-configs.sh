#!/usr/bin/env bash
# Freeze the nginx / process configs that previously took panels down.
# Does NOT lock application code, the database, logs, or import uploads —
# those must stay writable.
#
# Usage (as root on the VPS):
#   bash scripts/lock-production-configs.sh
# Unlock:
#   bash scripts/lock-production-configs.sh unlock
set -euo pipefail

LOCK_DIR="/etc/nexlify"
LOCK_FILE="${LOCK_DIR}/production.lock"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT="${LOCK_DIR}/backups/${STAMP}"

files_to_lock() {
  local f
  for f in \
    /etc/nginx/nginx.conf \
    /etc/nginx/conf.d/*.conf \
    /etc/nginx/sites-enabled/* \
    /etc/nginx/sites-available/* \
    /etc/nginx/rtmp.d/*.conf \
    /etc/nginx/rtmp.d \
    /etc/nginx/conf.d
  do
    [ -e "$f" ] || continue
    printf '%s\n' "$f"
  done | awk 'NF && !seen[$0]++'
}

cmd="${1:-lock}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

if [ "$cmd" = "unlock" ]; then
  while IFS= read -r f; do
    chattr -i "$f" 2>/dev/null || true
  done < <(files_to_lock)
  rm -f "$LOCK_FILE"
  echo "Unlocked nginx configs. Panel updates may rewrite them again."
  exit 0
fi

mkdir -p "$BACKUP_ROOT" "$LOCK_DIR"
while IFS= read -r f; do
  if [ -f "$f" ]; then
    cp -a "$f" "$BACKUP_ROOT/$(echo "$f" | tr '/' '_')"
  fi
done < <(files_to_lock)

if command -v pm2 >/dev/null 2>&1; then
  pm2 save >/dev/null 2>&1 || true
  cp -a /root/.pm2/dump.pm2 "$BACKUP_ROOT/pm2.dump.pm2" 2>/dev/null || true
fi

for d in /home/nexlify /home/nexlify-panel /opt/nexlify-panel /var/www/nexlify; do
  if [ -f "$d/.env" ]; then
    cp -a "$d/.env" "$BACKUP_ROOT/$(basename "$d").env"
    chmod 600 "$BACKUP_ROOT/$(basename "$d").env"
  fi
done

while IFS= read -r f; do
  chattr +i "$f" 2>/dev/null || true
done < <(files_to_lock)

{
  echo "locked_at=${STAMP}"
  echo "backup=${BACKUP_ROOT}"
  echo "scope=nginx-and-process-configs"
  echo "note=Application code, database, and imports remain writable."
} > "$LOCK_FILE"

echo "Locked nginx configs. Backups in ${BACKUP_ROOT}"
echo "Unlock later with: bash scripts/lock-production-configs.sh unlock"
