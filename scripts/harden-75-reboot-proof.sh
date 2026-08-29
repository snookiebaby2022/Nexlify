#!/usr/bin/env bash
# Verify MPEG-TS/HLS playback, reboot, and prove full recovery on server 75.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/harden-75-host-guard.sh"

PANEL="${PANEL_ROOT:-/opt/nexlify-panel}"
cd "$PANEL"
UA='XCIPTV/5.0.0'

verify_playback() {
  local label="$1"
  echo "==> Playback verify ($label)"
  FIX=$(cat /root/.nexlify-75-playback-fixture.json 2>/dev/null || node scripts/ensure-smoke-synthetic-fixture.cjs 2>/dev/null | tail -1)
  U=$(node -e "console.log(JSON.parse(process.argv[1]).username)" "$FIX")
  P=$(node -e "console.log(JSON.parse(process.argv[1]).password)" "$FIX")
  SID=$(node -e "const f=JSON.parse(process.argv[1]); console.log(f.playbackId ?? f.streamId)" "$FIX")
  TS_URL="http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts"
  HLS_URL="http://127.0.0.1:8080/live/${U}/${P}/${SID}.m3u8"

  TS_CODE=$(curl -sS -m 20 -A "$UA" -o /tmp/nexlify-smoke.ts -w '%{http_code}' "$TS_URL" || true)
  TS_CODE="${TS_CODE:-000}"
  TS_BYTES=$(wc -c < /tmp/nexlify-smoke.ts 2>/dev/null || echo 0)
  TS_MAGIC=$(head -c 1 /tmp/nexlify-smoke.ts 2>/dev/null | od -An -t x1 | tr -d ' ')
  test "$TS_CODE" = "200" || { echo "FAIL ts http=$TS_CODE"; return 1; }
  test "$TS_BYTES" -gt 10000 || { echo "FAIL ts bytes=$TS_BYTES"; return 1; }
  test "$TS_MAGIC" = "47" || { echo "FAIL ts sync=$TS_MAGIC"; return 1; }

  HLS_CODE=$(curl -sS -m 20 -A "$UA" -o /tmp/nexlify-smoke.m3u8 -w '%{http_code}' "$HLS_URL" || true)
  HLS_CODE="${HLS_CODE:-000}"
  test "$HLS_CODE" = "200" || { echo "FAIL hls http=$HLS_CODE"; return 1; }
  grep -q '\.ts' /tmp/nexlify-smoke.m3u8 || { echo "FAIL hls playlist empty"; return 1; }
  SEG=$(grep -m1 '\.ts' /tmp/nexlify-smoke.m3u8 | tr -d '\r')
  SEG_URL="http://127.0.0.1:8080${SEG#*http://127.0.0.1:8080}"
  [[ "$SEG" == http* ]] && SEG_URL="$SEG" || SEG_URL="http://127.0.0.1:8080${SEG}"
  sleep 8
  rm -f /tmp/nexlify-smoke-seg.ts
  SEG_CODE=$(curl -sS -m 20 -A "$UA" -o /tmp/nexlify-smoke-seg.ts -w '%{http_code}' "$SEG_URL" || true)
  SEG_CODE="${SEG_CODE:-000}"
  SEG_BYTES=$(wc -c < /tmp/nexlify-smoke-seg.ts 2>/dev/null || echo 0)
  test "$SEG_CODE" = "200" || { echo "FAIL seg http=$SEG_CODE"; return 1; }
  test "$SEG_BYTES" -gt 1000 || { echo "FAIL seg bytes=$SEG_BYTES"; return 1; }

  if command -v ffprobe >/dev/null 2>&1; then
    ffprobe -v quiet -show_streams -select_streams v:0 /tmp/nexlify-smoke.ts >/dev/null 2>&1 || echo "WARN ffprobe ts"
  fi
  echo "playback_ok ts=$TS_BYTES hls_seg=$SEG_BYTES"
}

verify_services() {
  echo "==> Service verify"
  curl -fsS -o /dev/null http://127.0.0.1:13000/api/health
  systemctl is-active nginx
  systemctl is-active postgresql || systemctl is-active postgresql@*
  systemctl is-active redis-server || systemctl is-active redis
  pm2 jlist | grep -q '"name":"nexlify"'
  ss -lntp | grep -E ':8080|:1935|:3001' >/dev/null
  ! ss -lntp | grep -E ':8787' >/dev/null || echo "WARN license still on 8787"
  echo "services_ok"
}

verify_playback pre-reboot
verify_services

if [ "${SKIP_REBOOT:-0}" != "1" ]; then
  echo "==> Rebooting server 75 for recovery proof"
  sync
  nohup bash -c 'sleep 2; reboot' >/dev/null 2>&1 &
  echo "reboot_scheduled"
  exit 0
fi

verify_playback post-reboot
verify_services
echo "reboot_proof_ok"
