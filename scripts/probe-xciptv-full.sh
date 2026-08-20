#!/usr/bin/env bash
set -euo pipefail
U="${1:-Wardonet31}"
P="${2:-VftY9jVbNT}"
API="http://127.0.0.1:13000/player_api.php?username=${U}&password=${P}"

SID=$(curl -sS "${API}&action=get_live_streams" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['stream_id'] if d else '')")
EPG=$(curl -sS "${API}&action=get_live_streams" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('epg_channel_id','') if d else '')")
echo "first_stream_id=${SID} epg=${EPG}"

for fmt in ts m3u8; do
  echo "=== edge .${fmt} ==="
  curl -sS -m 12 -A "XCIPTV/5.0.0" -w " http=%{http_code} bytes=%{size_download}\n" -o "/tmp/x.${fmt}" "http://127.0.0.1/live/${U}/${P}/${SID}.${fmt}" || echo fail
done

echo "=== HLS segment ==="
SEG=$(curl -sS -m 8 "http://127.0.0.1/live/${U}/${P}/${SID}.m3u8" | grep -v '^#' | head -1)
echo "seg_path=${SEG}"
curl -sS -m 12 -A "XCIPTV/5.0.0" -w " http=%{http_code} bytes=%{size_download}\n" -o /tmp/seg.bin "http://127.0.0.1${SEG}" || echo fail
xxd /tmp/seg.bin | head -2

echo "=== get_short_epg ==="
curl -sS "${API}&action=get_short_epg&stream_id=${SID}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('listings', len(d.get('epg_listings',[])))"

echo "=== public edge TS (45.88.138.18) ==="
curl -sS -m 12 -A "XCIPTV/5.0.0" -w " http=%{http_code} bytes=%{size_download}\n" -o /tmp/pub.bin "http://45.88.138.18/live/${U}/${P}/${SID}.ts" || echo fail
xxd /tmp/pub.bin | head -2
