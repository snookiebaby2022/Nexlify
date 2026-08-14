#!/usr/bin/env bash
# Ensure pg_dump is on PATH and is the newest packaged major version.
# Older /usr/bin/pg_dump wrappers often target PostgreSQL 14 while the
# panel server is 16 — that prints "server version mismatch" every cron tick.
#
# Best-effort on panel updates (not root / apt fail → warn and exit 0).
# Installer can set ENSURE_PG_DUMP_REQUIRED=1 to fail hard.
set -u

REQUIRED="${ENSURE_PG_DUMP_REQUIRED:-0}"
warn() { echo "ensure-pg-dump: $*" >&2; }
fail() {
  warn "$*"
  if [ "$REQUIRED" = "1" ]; then
    exit 1
  fi
  exit 0
}

link_newest() {
  local best="" ver=0 b n
  for b in /usr/lib/postgresql/*/bin/pg_dump; do
    [ -x "$b" ] || continue
    n="$(printf '%s' "$b" | sed -n 's|.*/postgresql/\([0-9][0-9]*\)/bin/pg_dump|\1|p')"
    if [ "${n:-0}" -gt "$ver" ]; then
      ver="$n"
      best="$b"
    fi
  done
  if [ -z "$best" ]; then
    return 1
  fi
  if [ "$(id -u)" -eq 0 ]; then
    ln -sfn "$best" /usr/local/bin/pg_dump
    if [ -x "$(dirname "$best")/pg_restore" ]; then
      ln -sfn "$(dirname "$best")/pg_restore" /usr/local/bin/pg_restore
    fi
  fi
  echo "$best"
  return 0
}

install_client() {
  if [ "$(id -u)" -ne 0 ]; then
    return 1
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    return 1
  fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq postgresql-client postgresql-client-common >/dev/null 2>&1 \
    || apt-get install -y -qq postgresql-client >/dev/null 2>&1 \
    || return 1
  return 0
}

newest="$(link_newest || true)"
if [ -z "$newest" ]; then
  if install_client; then
    newest="$(link_newest || true)"
  fi
fi

if [ -z "$newest" ] && ! command -v pg_dump >/dev/null 2>&1; then
  fail "pg_dump not found — install postgresql-client"
fi

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump --version 2>/dev/null || true
elif [ -n "$newest" ]; then
  "$newest" --version 2>/dev/null || true
fi

exit 0
