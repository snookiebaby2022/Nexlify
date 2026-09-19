#!/usr/bin/env bash
# Measure cold + warm TTFB for MPEG-TS zap (first 0x47 byte).
set -uo pipefail
BASE="${1:-http://127.0.0.1}"
FIX="$(cat /root/.nexlify-75-playback-fixture.json 2>/dev/null || true)"
if [ -z "$FIX" ]; then
  echo "no fixture" >&2
  exit 1
fi
U="$(node -e 'console.log(JSON.parse(process.argv[1]).username)' "$FIX")"
P="$(node -e 'console.log(JSON.parse(process.argv[1]).password)' "$FIX")"
curl -fsS -m 30 "${BASE}/player_api.php?username=${U}&password=${P}&action=get_live_streams" -o /tmp/zap-live.json
SID="$(node -e 'const a=JSON.parse(require("fs").readFileSync("/tmp/zap-live.json","utf8")); console.log(a[0].stream_id)')"
URL="${BASE}/live/${U}/${P}/${SID}.ts"
echo "URL=$URL"

ROOT_DIR=/var/lib/nexlify-lb
shopt -s nullglob
for pf in "$ROOT_DIR"/pids/*.pid; do
  pid="$(tr -dc '0-9' < "$pf" | head -c 12)"
  [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  rm -f "$pf"
done
rm -f "$ROOT_DIR"/viewers/* 2>/dev/null || true
rm -rf "$ROOT_DIR"/hls/* 2>/dev/null || true

measure() {
  local label=$1
  local out code ttfb total bytes magic remux ttfb_ms
  rm -f /tmp/zap-ttfb.ts /tmp/zap-ttfb.hdr
  touch /tmp/zap-ttfb.ts /tmp/zap-ttfb.hdr
  out="$(curl -sS -m 12 -A 'VLC/3.0.20' -o /tmp/zap-ttfb.ts -D /tmp/zap-ttfb.hdr \
    -w '%{http_code} %{time_starttransfer} %{time_total}' "$URL" 2>/dev/null || true)"
  code="$(echo "$out" | awk '{print $1}')"
  ttfb="$(echo "$out" | awk '{print $2}')"
  total="$(echo "$out" | awk '{print $3}')"
  bytes="$(stat -c%s /tmp/zap-ttfb.ts 2>/dev/null || echo 0)"
  magic="$(od -An -t x1 -N 1 /tmp/zap-ttfb.ts 2>/dev/null | tr -d ' ')"
  # Endless stream: curl -m often yields empty http_code with bytes already written
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    if [ "${bytes:-0}" -gt 10000 ] && [ "$magic" = "47" ]; then
      code=200
    fi
  fi
  remux="$(grep -i 'X-Nexlify-Remux:' /tmp/zap-ttfb.hdr 2>/dev/null | awk '{print $2}' | tr -d '\r' || true)"
  ttfb_ms="$(awk -v t="${ttfb:-0}" 'BEGIN{printf "%.0f", (t+0)*1000}')"
  echo "$label http=${code:-000} ttfb=${ttfb_ms}ms total=${total:-?}s bytes=$bytes magic=$magic remux=${remux:-?}"
}

measure COLD
sleep 2
measure WARM
