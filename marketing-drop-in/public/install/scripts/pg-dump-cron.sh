#!/usr/bin/env bash
# PostgreSQL dump helper for Nexlify panel VPS (system crontab optional).
# The in-panel nexlify-cron job uses the same argv/PGPASSWORD approach in src/lib/pg-dump.ts.
#
# Cron example (daily 04:00 UTC): 0 4 * * * /home/nexlify/scripts/pg-dump-cron.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
detect_root() {
  if [ -n "${NEXLIFY_PANEL_ROOT:-}" ] && [ -f "${NEXLIFY_PANEL_ROOT}/.env" ]; then
    echo "$NEXLIFY_PANEL_ROOT"
    return
  fi
  local candidate
  candidate="$(cd "$SCRIPT_DIR/.." && pwd)"
  if [ -f "$candidate/.env" ] || [ -f "$candidate/package.json" ]; then
    echo "$candidate"
    return
  fi
  for candidate in /home/nexlify /home/nexlify-panel /opt/nexlify-panel; do
    if [ -f "$candidate/.env" ] || [ -f "$candidate/package.json" ]; then
      echo "$candidate"
      return
    fi
  done
  echo "$(cd "$SCRIPT_DIR/.." && pwd)"
}

ROOT="$(detect_root)"
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

find_pg_dump() {
  if [ -n "${PG_DUMP_PATH:-}" ] && [ -x "$PG_DUMP_PATH" ]; then
    echo "$PG_DUMP_PATH"
    return
  fi
  local best="" ver=0 b n
  for b in /usr/lib/postgresql/*/bin/pg_dump; do
    [ -x "$b" ] || continue
    n="$(printf '%s' "$b" | sed -n 's|.*/postgresql/\([0-9][0-9]*\)/bin/pg_dump|\1|p')"
    if [ "${n:-0}" -gt "$ver" ]; then
      ver="$n"
      best="$b"
    fi
  done
  if [ -n "$best" ]; then
    echo "$best"
    return
  fi
  command -v pg_dump
}

PG_DUMP_BIN="$(find_pg_dump)" || {
  echo "pg_dump not found — install postgresql-client" >&2
  exit 1
}

parse_url() {
  python3 - <<'PY'
import os, urllib.parse, shlex
raw = os.environ.get("DATABASE_URL", "").strip().strip('"').strip("'")
u = urllib.parse.urlparse(raw)
if u.scheme not in ("postgres", "postgresql"):
    raise SystemExit("DATABASE_URL must use postgresql://")
qs = urllib.parse.parse_qs(u.query)
host = u.hostname or (qs.get("host") or ["localhost"])[0]
port = str(u.port or (qs.get("port") or ["5432"])[0])
user = urllib.parse.unquote(u.username or "nexlify")
password = urllib.parse.unquote(u.password or "")
db = urllib.parse.unquote((u.path or "/nexlify").lstrip("/").split("/")[0] or "nexlify")
print(f"export PGHOST={shlex.quote(host)}")
print(f"export PGPORT={shlex.quote(str(port))}")
print(f"export PGUSER={shlex.quote(user)}")
print(f"export PGPASSWORD={shlex.quote(password)}")
print(f"export PGDATABASE={shlex.quote(db)}")
PY
}

eval "$(parse_url)"

OUT="$BACKUP_DIR/nexlify-pg-$STAMP.sql.gz"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-30}"

set -o pipefail
"$PG_DUMP_BIN" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
  --no-owner --no-acl --no-password | gzip -9 > "$OUT"

if [ ! -s "$OUT" ] || [ "$(stat -c%s "$OUT" 2>/dev/null || echo 0)" -lt 50 ]; then
  rm -f "$OUT"
  echo "pg_dump produced an empty archive" >&2
  exit 1
fi

echo "Wrote $OUT ($PG_DUMP_BIN)"

find "$BACKUP_DIR" -name 'nexlify-pg-*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true
