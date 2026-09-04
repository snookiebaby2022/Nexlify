#!/usr/bin/env bash
# Fail if /live/ returns a redirect (Xtream apps do not follow 302 for .ts).
set -euo pipefail
PORT="${1:-8080}"
case "$PORT" in
  ''|*[!0-9]*) PORT=8080 ;;
esac
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PORT}/live/nexlify-health/nexlify-health/0.ts" || echo 000)"
case "$code" in
  301|302|303|307|308)
    echo "LIVE_REDIRECT status=$code — MPEG-TS clients will fail"
    exit 1
    ;;
esac
echo "live_path_ok status=$code (not a redirect)"
exit 0
