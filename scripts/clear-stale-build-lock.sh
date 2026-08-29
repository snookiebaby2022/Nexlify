#!/usr/bin/env bash
# Clear /tmp/nexlify-panel-build.lock when no next build is running (stale deploy lock).
set -euo pipefail
LOCK=/tmp/nexlify-panel-build.lock
if command -v flock >/dev/null 2>&1; then
  if flock -n 9>"$LOCK" bash -c 'exit 0' 2>/dev/null; then
    rm -f "$LOCK"
    echo "cleared stale build lock"
    exit 0
  fi
fi
if pgrep -f 'next/dist/bin/next build' >/dev/null 2>&1; then
  echo "next build still running — not clearing lock" >&2
  exit 1
fi
rm -f "$LOCK"
echo "cleared orphaned build lock"
