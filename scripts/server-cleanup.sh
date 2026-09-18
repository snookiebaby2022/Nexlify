#!/usr/bin/env bash
# Safe panel + VPS cleanup: old JSON/ZIP backups, flat pg dumps, temp artifacts.
# Run on panel host: bash scripts/server-cleanup.sh
set -uo pipefail

detect_root() {
  if [ -n "${NEXLIFY_PANEL_ROOT:-}" ] && [ -d "$NEXLIFY_PANEL_ROOT" ]; then
    echo "$NEXLIFY_PANEL_ROOT"
    return
  fi
  for candidate in /opt/nexlify-panel /home/nexlify-panel /home/nexlify; do
    if [ -f "$candidate/package.json" ] || [ -f "$candidate/.env" ]; then
      echo "$candidate"
      return
    fi
  done
  echo "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
}

ROOT="$(detect_root)"
FREED=0
removed() { echo "  removed: $*"; FREED=$((FREED + 1)); }

echo "=== Nexlify panel cleanup ($ROOT) ==="

BACKUP_DIR="$ROOT/backups"
if [ -d "$BACKUP_DIR/pg" ]; then
  mkdir -p "$BACKUP_DIR"
  for f in "$BACKUP_DIR/pg"/nexlify-pg-*.sql.gz; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    if [ ! -f "$BACKUP_DIR/$base" ]; then
      mv "$f" "$BACKUP_DIR/$base" && echo "  moved: pg/$base → backups/"
    else
      rm -f "$f" && removed "duplicate pg/$base"
    fi
  done
  rmdir "$BACKUP_DIR/pg" 2>/dev/null && echo "  removed empty backups/pg/" || true
fi

if [ -d "$BACKUP_DIR" ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.json' -o -name '*.zip' -o -name 'panel-backup-*' \) -print0 2>/dev/null |
    while IFS= read -r -d '' f; do
      rm -f "$f" && removed "$f"
    done
fi

for d in /tmp/nexlify-publish-* /tmp/nexlify-rebuild-* /tmp/nexlify-streaming-* \
  /tmp/nexlify-marketing-src-* /tmp/nexlify-panel-build-* /tmp/next-rebuild.out; do
  [ -e "$d" ] && rm -rf "$d" && removed "$d"
done

# Stale build lock (no live next build / fast-update)
LOCK="/tmp/nexlify-panel-build.lock"
if [ -f "$LOCK" ] && ! pgrep -f 'next build' >/dev/null 2>&1 && ! pgrep -f 'apply-panel-fast-update' >/dev/null 2>&1; then
  rm -f "$LOCK" && removed "$LOCK (stale)"
fi

# Old one-off deploy logs (keep last 7 days)
find /var/log -maxdepth 1 -type f -name 'nexlify-*-deploy.log' -mtime +7 -print0 2>/dev/null |
  while IFS= read -r -d '' f; do rm -f "$f" && removed "$f"; done
find /var/log -maxdepth 1 -type f -name 'nexlify-[0-9]*-*.log' -mtime +14 -print0 2>/dev/null |
  while IFS= read -r -d '' f; do rm -f "$f" && removed "$f"; done

# Nested .next backups from failed swaps
find "$ROOT" -maxdepth 3 -type d -name '.next.backup.*' -mtime +3 -print0 2>/dev/null |
  while IFS= read -r -d '' d; do rm -rf "$d" && removed "$d"; done

for envdir in "$ROOT" /var/www/nexlify; do
  [ -d "$envdir" ] || continue
  ls -t "$envdir"/.env.backup.* 2>/dev/null | tail -n +3 | while read -r f; do
    rm -f "$f" && removed "$f"
  done
done

if command -v pm2 >/dev/null 2>&1; then
  pm2 flush >/dev/null 2>&1 && echo "  PM2 logs flushed"
fi

echo ""
echo "Cleanup done ($FREED items removed). SQL dumps kept in $BACKUP_DIR/*.sql.gz"
