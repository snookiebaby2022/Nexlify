#!/usr/bin/env bash
# Tail IPTV panel / nginx / edge logs; highlight failure keywords; summarize every 60s.
#
# Usage:
#   bash scripts/diag-panel-log-tail.sh
#   LOG_GLOBS="/var/log/nginx/error.log /root/.pm2/logs/nexlify-*-error.log" bash scripts/diag-panel-log-tail.sh
#
# Highlights: error, timeout, 403, 404, connection refused, buffer underrun
set -euo pipefail

SUMMARY_EVERY="${SUMMARY_EVERY:-60}"
PATTERN='error|timeout|403|404|connection refused|buffer underrun|buffer_underrun'

if [[ -n "${LOG_GLOBS:-}" ]]; then
  # shellcheck disable=SC2206
  FILES=( $LOG_GLOBS )
else
  CANDIDATES=(
    /var/log/nginx/error.log
    /var/log/nginx/access.log
    /var/log/nexlify-watchdog.log
    /var/log/nexlify-hls-ffmpeg.log
    /root/.pm2/logs/nexlify-iptv-edge-error.log
    /root/.pm2/logs/nexlify-iptv-edge-out.log
    /root/.pm2/logs/nexlify-panel-error.log
    /root/.pm2/logs/nexlify-panel-out.log
  )
  FILES=()
  for f in "${CANDIDATES[@]}"; do
    [[ -r "$f" ]] && FILES+=("$f")
  done
fi

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No readable log files found. Set LOG_GLOBS=\"/path/a /path/b\"" >&2
  exit 1
fi

echo "Tailing: ${FILES[*]}"
echo "Highlight pattern: ${PATTERN}"
echo "Summary every ${SUMMARY_EVERY}s (Ctrl+C to stop)"
echo

declare -A COUNTS=(
  [error]=0
  [timeout]=0
  [403]=0
  [404]=0
  ["connection refused"]=0
  ["buffer underrun"]=0
)

last_summary=$(date +%s)

colorize() {
  local line="$1"
  local lower
  lower=$(echo "$line" | tr '[:upper:]' '[:lower:]')
  if echo "$lower" | grep -Eqi 'error|timeout|403|404|connection refused|buffer underrun|buffer_underrun'; then
    # red-ish for failures
    printf '\033[31m%s\033[0m\n' "$line"
  else
    printf '%s\n' "$line"
  fi
}

bump_counts() {
  local lower
  lower=$(echo "$1" | tr '[:upper:]' '[:lower:]')
  echo "$lower" | grep -qi 'error' && COUNTS[error]=$((COUNTS[error] + 1)) || true
  echo "$lower" | grep -qi 'timeout' && COUNTS[timeout]=$((COUNTS[timeout] + 1)) || true
  echo "$lower" | grep -Eqi '(^|[^0-9])403([^0-9]|$)' && COUNTS[403]=$((COUNTS[403] + 1)) || true
  echo "$lower" | grep -Eqi '(^|[^0-9])404([^0-9]|$)' && COUNTS[404]=$((COUNTS[404] + 1)) || true
  echo "$lower" | grep -qi 'connection refused' && COUNTS["connection refused"]=$((COUNTS["connection refused"] + 1)) || true
  echo "$lower" | grep -Eqi 'buffer underrun|buffer_underrun' && COUNTS["buffer underrun"]=$((COUNTS["buffer underrun"] + 1)) || true
}

print_summary() {
  echo
  echo "── summary $(date -u +%Y-%m-%dT%H:%M:%SZ) ──"
  for k in error timeout 403 404 "connection refused" "buffer underrun"; do
    echo "  $k: ${COUNTS[$k]}"
  done
  echo
}

# shellcheck disable=SC2068
tail -n 0 -F ${FILES[@]} 2>/dev/null | while IFS= read -r line; do
  if echo "$line" | grep -Eqi "$PATTERN"; then
    colorize "$line"
    bump_counts "$line"
  fi
  now=$(date +%s)
  if (( now - last_summary >= SUMMARY_EVERY )); then
    print_summary
    last_summary=$now
  fi
done
