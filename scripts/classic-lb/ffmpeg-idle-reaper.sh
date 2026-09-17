#!/usr/bin/env bash
# Stop idle FFmpeg packagers when no viewer touch for FFMPEG_IDLE_SECS.
set -euo pipefail
ENV_FILE="${NEXLIFY_LB_ENV:-/etc/nexlify-lb/lb.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && set -a && . "$ENV_FILE" && set +a
ROOT="${STREAM_ROOT:-/var/lib/nexlify-lb}"
IDLE="${FFMPEG_IDLE_SECS:-90}"
NOW="$(date +%s)"
shopt -s nullglob
for viewer in "$ROOT"/viewers/*; do
  [ -f "$viewer" ] || continue
  sid="$(basename "$viewer")"
  last="$(tr -dc '0-9' < "$viewer" | head -c 12)"
  [ -n "$last" ] || continue
  age=$((NOW - last))
  if [ "$age" -lt "$IDLE" ]; then
    continue
  fi
  pid_file="$ROOT/pids/${sid}.pid"
  if [ -f "$pid_file" ]; then
    pid="$(tr -dc '0-9' < "$pid_file" | head -c 12)"
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
  rm -f "$viewer"
done
