#!/usr/bin/env bash
# Probe live playback across IPTV app user-agents.
set -euo pipefail
cd /opt/nexlify-panel
USER="${1:-Wardonet31}"
PASS="${2:-VftY9jVbNT}"
BASE="${PANEL_URL:-http://127.0.0.1:13000}"
EDGE="${EDGE_URL:-http://127.0.0.1:80}"

SID=$(curl -sS "$BASE/player_api.php?username=$USER&password=$PASS&action=get_live_streams" \
  | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[0]?.stream_id")

echo "stream_id=$SID"
echo "epg_channel_id=$(curl -sS "$BASE/player_api.php?username=$USER&password=$PASS&action=get_live_streams" \
  | node -p "JSON.parse(require('fs').readFileSync(0,'utf8'))[0]?.epg_channel_id")"

for UA in "IPTVSmarters/3.0.0" "XCIPTV/5.0.0" "TiviMate/4.0.0" "VLC/3.0.20 LibVLC/3.0.20"; do
  echo ""
  echo "=== $UA ==="
  curl -sS -m 8 -o /dev/null -w "HEAD.ts=%{http_code}\n" -I -A "$UA" "$BASE/live/$USER/$PASS/${SID}.ts"
  curl -sS -m 15 -o /tmp/probe.ts -w "GET.ts=%{http_code} bytes=%{size_download}\n" -A "$UA" "$BASE/live/$USER/$PASS/${SID}.ts" || true
  xxd /tmp/probe.ts 2>/dev/null | head -1 || echo "no ts data"
  curl -sS -m 15 -o /tmp/probe.m3u8 -w "GET.m3u8 panel=%{http_code} bytes=%{size_download}\n" -A "$UA" "$BASE/live/$USER/$PASS/${SID}.m3u8" || true
  head -c 150 /tmp/probe.m3u8 2>/dev/null; echo
  curl -sS -m 15 -o /tmp/probe-edge.ts -w "GET.ts edge80=%{http_code} bytes=%{size_download}\n" -A "$UA" "$EDGE/live/$USER/$PASS/${SID}.ts" || true
  xxd /tmp/probe-edge.ts 2>/dev/null | head -1 || echo "no edge ts"
  curl -sS -m 15 -o /tmp/probe-edge.m3u8 -w "GET.m3u8 edge80=%{http_code} bytes=%{size_download}\n" -A "$UA" "$EDGE/live/$USER/$PASS/${SID}.m3u8" || true
  head -c 150 /tmp/probe-edge.m3u8 2>/dev/null; echo
done

echo ""
echo "=== short EPG ==="
curl -sS -m 20 "$BASE/player_api.php?username=$USER&password=$PASS&action=get_short_epg&stream_id=$SID&limit=2" \
  | node -p "JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')),null,2).slice(0,500)"
