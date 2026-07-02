# PostgreSQL pg_dump cron helper for Nexlify panel VPS
# Install: copy to /home/nexlify-panel/scripts/pg-dump-cron.sh and chmod +x
# Cron example (daily 04:00 UTC): 0 4 * * * /home/nexlify-panel/scripts/pg-dump-cron.sh

set -euo pipefail

ROOT="${NEXLIFY_PANEL_ROOT:-/home/nexlify-panel}"
BACKUP_DIR="${PG_DUMP_DIR:-$ROOT/backups/pg}"
KEEP_DAYS="${PG_DUMP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"

if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ROOT/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL not set" >&2
  exit 1
fi

OUT="$BACKUP_DIR/nexlify-pg-$STAMP.sql.gz"
pg_dump "$DATABASE_URL" | gzip -9 > "$OUT"
echo "Wrote $OUT"

find "$BACKUP_DIR" -name 'nexlify-pg-*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
