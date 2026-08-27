#!/usr/bin/env bash
# Scale panel workers UP only — never kills existing workers (safe during IPTV).
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
cd "$PANEL_DIR"
set -a
[ -f .env ] && . ./.env
set +a

TARGET="${PANEL_INSTANCES:-4}"
SPARE="${NEXLIFY_PANEL_WORKER_SPARE:-1}"
MAX="${NEXLIFY_PANEL_INSTANCES_MAX:-6}"
if [ "${NEXLIFY_STREAMING_OPTIMIZED:-0}" = "1" ]; then
  if [ "$TARGET" -gt 6 ]; then TARGET=6; fi
  if [ "$MAX" -gt 6 ]; then MAX=6; fi
fi
want=$((TARGET + SPARE))
if [ "$want" -gt "$MAX" ]; then want=$MAX; fi
if [ "$want" -lt 3 ]; then want=3; fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "[scale-live] pm2 missing"
  exit 1
fi

current="$(pm2 jlist 2>/dev/null | node -e '
const n=JSON.parse(require("fs").readFileSync(0,"utf8")).filter(p=>p.name==="nexlify").length;
console.log(n);
' 2>/dev/null || echo 0)"

current="${current:-0}"
if [ "$current" -ge "$want" ]; then
  echo "[scale-live] already ${current} workers (want ${want})"
  exit 0
fi

echo "[scale-live] scaling nexlify ${current} → ${want} (additive, no restart)"
pm2 scale nexlify "$want" --update-env
pm2 save >/dev/null 2>&1 || true
