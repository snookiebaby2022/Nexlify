#!/usr/bin/env bash
# Topology-independent playback contract: 200 + media bytes, never 302 for IPTV paths.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -d "$PANEL_DIR" ] && cd "$PANEL_DIR"

read_env() {
  grep "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

MODE="$(read_env NEXLIFY_LIVE_EDGE_MODE)"
[ -z "$MODE" ] && MODE="local"
MODE="$(echo "$MODE" | tr '[:upper:]' '[:lower:]')"

STREAM_PORT="$(read_env STREAM_HTTP_PORT)"
[ -z "$STREAM_PORT" ] && STREAM_PORT="$(read_env STREAM_EDGE_PORT)"
[ -z "$STREAM_PORT" ] && STREAM_PORT=8080

PANEL_PORT="$(read_env PORT)"
[ -z "$PANEL_PORT" ] && PANEL_PORT="$(read_env PANEL_PORT)"
[ -z "$PANEL_PORT" ] && PANEL_PORT=13000

UA="${VERIFY_UA:-VLC/3.0.20 LibVLC/3.0.20}"
BASE="${VERIFY_BASE:-http://127.0.0.1:${STREAM_PORT}}"
FAIL=0

pass() { echo "  OK   $*"; }
fail() { echo "  FAIL $*"; FAIL=1; }

echo "=== Playback parity verify (mode=${MODE} base=${BASE}) ==="

echo "[1] Topology state"
if [ "$MODE" = "remote" ] || [ "$MODE" = "split" ] || [ "$MODE" = "remote-edge" ]; then
  [ -f /etc/nginx/conf.d/nexlify-live-remote-edge.conf ] && pass "remote nginx conf present" || fail "remote nginx conf missing"
  if pm2 describe nexlify-iptv-edge >/dev/null 2>&1; then
    edge_status="$(pm2 jlist 2>/dev/null | node -e "
      try {
        const a = JSON.parse(require('fs').readFileSync(0,'utf8')).find(x => x.name === 'nexlify-iptv-edge');
        process.stdout.write(a?.pm2_env?.status || 'missing');
      } catch { process.stdout.write('missing'); }
    " 2>/dev/null || echo missing)"
    [ "$edge_status" = "stopped" ] || [ "$edge_status" = "missing" ] && pass "local edge stopped in remote mode" || fail "local edge should be stopped (status=$edge_status)"
  else
    pass "local edge not registered"
  fi
else
  [ ! -f /etc/nginx/conf.d/nexlify-live-remote-edge.conf ] && pass "no remote nginx conf" || fail "remote nginx conf should not exist in local mode"
  pm2 describe nexlify-iptv-edge >/dev/null 2>&1 && pass "local edge registered" || fail "local edge missing in local mode"
fi

echo "[2] Edge forward() media guard"
if [ -f scripts/iptv-edge-proxy.mjs ]; then
  grep -q 'media must splice locally' scripts/iptv-edge-proxy.mjs && pass "edge media loop guard" || fail "edge missing media loop guard"
else
  fail "scripts/iptv-edge-proxy.mjs missing"
fi

echo "[3] No 302 on media paths"
for path in /live/__parity__/test/__/1.ts /live/__parity__/test/__/1.m3u8; do
  code="$(curl -sS -m 12 -A "$UA" -o /dev/null -w '%{http_code}' "${BASE}${path}" 2>/dev/null || echo 000)"
  [ "$code" != "302" ] && pass "no redirect ${path} (${code})" || fail "redirect on ${path}"
done

echo "[4] Panel health"
curl -fsS -m 8 "http://127.0.0.1:${PANEL_PORT}/api/health" >/dev/null && pass "panel health" || fail "panel health"

echo "[5] Stream edge API surface"
api_code="$(curl -sS -m 12 -A "$UA" -o /dev/null -w '%{http_code}' "${BASE}/player_api.php?username=__parity__" 2>/dev/null || echo 000)"
[ "$api_code" != "000" ] && pass "player_api reachable (${api_code})" || fail "player_api unreachable"

FIX=""
if [ -f /root/.nexlify-75-playback-fixture.json ]; then
  FIX="$(cat /root/.nexlify-75-playback-fixture.json)"
elif [ -f scripts/ensure-smoke-playback.cjs ]; then
  FIX="$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1 || true)"
fi

if [ -n "$FIX" ] && echo "$FIX" | grep -q '"username"'; then
  echo "[6] Byte-level TS/HLS playback"
  U="$(node -e "console.log(JSON.parse(process.argv[1]).username)" "$FIX")"
  P="$(node -e "console.log(JSON.parse(process.argv[1]).password)" "$FIX")"
  SID="$(node -e "const f=JSON.parse(process.argv[1]); console.log(f.playbackId ?? f.streamId ?? f.xtreamId)" "$FIX")"
  TS_URL="${BASE}/live/${U}/${P}/${SID}.ts"
  HLS_URL="${BASE}/live/${U}/${P}/${SID}.m3u8"

  TS_CODE="$(curl -sS -m 25 -A "$UA" -o /tmp/nexlify-parity.ts -w '%{http_code}' "$TS_URL" 2>/dev/null || echo 000)"
  TS_BYTES="$(wc -c < /tmp/nexlify-parity.ts 2>/dev/null || echo 0)"
  TS_MAGIC="$(head -c 1 /tmp/nexlify-parity.ts 2>/dev/null | od -An -t x1 | tr -d ' ')"
  [ "$TS_CODE" = "200" ] && pass "ts http 200" || fail "ts http=$TS_CODE"
  [ "$TS_BYTES" -gt 10000 ] && pass "ts bytes=$TS_BYTES" || fail "ts bytes=$TS_BYTES"
  [ "$TS_MAGIC" = "47" ] && pass "ts sync 0x47" || fail "ts sync=$TS_MAGIC"

  HLS_CODE="$(curl -sS -m 25 -A "$UA" -o /tmp/nexlify-parity.m3u8 -w '%{http_code}' "$HLS_URL" 2>/dev/null || echo 000)"
  [ "$HLS_CODE" = "200" ] && pass "hls playlist 200" || fail "hls http=$HLS_CODE"
  grep -q '\.ts' /tmp/nexlify-parity.m3u8 && pass "hls playlist has segments" || fail "hls playlist empty"

  SEG="$(grep -m1 '\.ts' /tmp/nexlify-parity.m3u8 | tr -d '\r')"
  if [[ "$SEG" == http* ]]; then SEG_URL="$SEG"; else SEG_URL="${BASE}${SEG}"; fi
  sleep 8
  SEG_CODE="$(curl -sS -m 25 -A "$UA" -o /tmp/nexlify-parity-seg.ts -w '%{http_code}' "$SEG_URL" 2>/dev/null || echo 000)"
  SEG_BYTES="$(wc -c < /tmp/nexlify-parity-seg.ts 2>/dev/null || echo 0)"
  [ "$SEG_CODE" = "200" ] && pass "hls segment 200" || fail "hls segment http=$SEG_CODE"
  [ "$SEG_BYTES" -gt 1000 ] && pass "hls segment bytes=$SEG_BYTES" || fail "hls segment bytes=$SEG_BYTES"
else
  echo "[6] Byte-level playback skipped (no smoke fixture)"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "PLAYBACK_PARITY_OK mode=${MODE}"
  exit 0
fi
echo "PLAYBACK_PARITY_FAILED mode=${MODE}"
exit 1
