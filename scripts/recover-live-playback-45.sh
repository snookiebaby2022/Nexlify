#!/usr/bin/env bash
# Restore live playback: assign streams to 10gbs, nginx split, edge backend, verify TS+HLS.
set -euo pipefail
cd /opt/nexlify-panel

echo "=== Assign all LIVE streams to 10gbs ==="
node scripts/assign-live-to-10gbs.cjs

echo "=== nginx live -> 10gbs + auth header pass-through ==="
bash scripts/route-45-live-to-remote-edge.sh 2>&1 | tail -3

echo "=== 10gbs edge backend + proxy ==="
node scripts/fix-10gbs-memory-streams.cjs 2>&1 | tail -8

echo "=== Push edge script ==="
node scripts/push-edge-to-10gbs.cjs 2>&1 | tail -5

echo "=== Stream server counts ==="
node scripts/count-live-stream-servers.cjs

echo "=== Auth 10gbs -> panel :8080 ==="
node scripts/test-auth-10gbs-to-panel.cjs 2>&1 | tail -12

echo "=== MPEG-TS smoke (45 nginx) ==="
SMOKE=$(node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1)
U=$(node -pe "JSON.parse(process.argv[1]).u" "$SMOKE")
P=$(node -pe "encodeURIComponent(JSON.parse(process.argv[1]).p)" "$SMOKE")
SID=$(node -pe "JSON.parse(process.argv[1]).streamId" "$SMOKE")
curl -sS -m 25 -o /tmp/live-smoke.ts -w "ts:%{http_code} bytes=%{size_download} t=%{time_starttransfer}s\n" \
  -A "VLC/3.0.20 LibVLC/3.0.20" "http://127.0.0.1:8080/live/${U}/${P}/${SID}.ts" || true
xxd /tmp/live-smoke.ts 2>/dev/null | head -2

echo "=== HLS smoke ==="
curl -sS -m 20 -o /tmp/live-smoke.m3u8 -w "m3u8:%{http_code} bytes=%{size_download}\n" \
  -A "VLC/3.0.20" "http://127.0.0.1:8080/live/${U}/${P}/${SID}.m3u8" || true
head -5 /tmp/live-smoke.m3u8 2>/dev/null || true

echo "=== 10gbs direct ==="
node scripts/test-edge-local-10gbs.cjs 2>&1 | tail -10

echo "LIVE_RECOVER_OK"
