#!/usr/bin/env bash
set -euo pipefail
U=lucky15
P=chedpie30
B="http://127.0.0.1:8080"

curl -s --compressed "$B/player_api.php?username=$U&password=$P&action=get_live_streams" > /tmp/live.json
curl -s --compressed "$B/player_api.php?username=$U&password=$P&action=get_vod_streams" > /tmp/vod.json
curl -s --compressed "$B/player_api.php?username=$U&password=$P&action=get_series" > /tmp/series.json

node <<'NODE'
const live = JSON.parse(require("fs").readFileSync("/tmp/live.json", "utf8"));
const vod = JSON.parse(require("fs").readFileSync("/tmp/vod.json", "utf8"));
const ser = JSON.parse(require("fs").readFileSync("/tmp/series.json", "utf8"));
const L = live.find((s) => s.stream_id) || live[0];
const V = vod.find((s) => s.stream_id) || vod[0];
const S = ser.find((s) => s.series_id) || ser[0];
console.log("LIVE sample:", L?.stream_id, (L?.name || "").slice(0, 50));
console.log("VOD sample:", V?.stream_id, (V?.name || "").slice(0, 50), V?.container_extension || "mp4");
console.log("SERIES sample:", S?.series_id, (S?.name || "").slice(0, 50));
require("fs").writeFileSync(
  "/tmp/ids.json",
  JSON.stringify({
    live: L?.stream_id,
    vod: V?.stream_id,
    vext: V?.container_extension || "mp4",
    series: S?.series_id,
  })
);
NODE

LIVE_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ids.json')).live")
VOD_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ids.json')).vod")
VOD_EXT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ids.json')).vext")
SERIES_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ids.json')).series")

echo "=== LIVE $LIVE_ID ==="
curl -s -o /tmp/live.ts -w "live.ts HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 10 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${LIVE_ID}.ts"
head -c 4 /tmp/live.ts | od -An -tx1
curl -s -o /dev/null -w "live.m3u8 HTTP %{http_code} %{time_total}s\n" --max-time 8 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${LIVE_ID}.m3u8"

echo "=== VOD $VOD_ID ==="
curl -s -o /tmp/vod.bin -w "movie HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 25 \
  -H "User-Agent: VLC/3.0.20 LibVLC/3.0.20" "$B/movie/$U/$P/${VOD_ID}.${VOD_EXT}" -r 0-500000
head -c 4 /tmp/vod.bin | od -An -tx1

echo "=== SERIES $SERIES_ID ==="
curl -s --compressed "$B/player_api.php?username=$U&password=$P&action=get_series_info&series_id=$SERIES_ID" > /tmp/sinfo.json
node <<'NODE'
const d = JSON.parse(require("fs").readFileSync("/tmp/sinfo.json", "utf8"));
const eps = d.episodes || {};
for (const k of Object.keys(eps)) {
  const e = eps[k]?.[0];
  if (e) {
    const id = e.id || e.stream_id;
    const ext = e.container_extension || "mp4";
    console.log("EP sample:", id, (e.title || "").slice(0, 40), ext);
    require("fs").writeFileSync("/tmp/ep.json", JSON.stringify({ id, ext }));
    process.exit(0);
  }
}
console.log("NO_EPISODES");
NODE

if [ -f /tmp/ep.json ]; then
  EID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ep.json')).id")
  EEXT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/ep.json')).ext")
  curl -s -o /tmp/ser.bin -w "series HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 25 \
    -H "User-Agent: VLC/3.0.20 LibVLC/3.0.20" "$B/series/$U/$P/${EID}.${EEXT}" -r 0-500000
  head -c 4 /tmp/ser.bin | od -An -tx1
fi

echo "=== BBC One FHD (content check) ==="
curl -s -o /dev/null -w "bbc m3u8 HTTP %{http_code} %{time_total}s\n" --max-time 8 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/cmt1nmpf5003ivhhz6n6xjxyw.m3u8"
curl -s -o /tmp/bbc.ts -w "bbc seg0 HTTP %{http_code} %{size_download}B %{time_total}s\n" --max-time 15 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/cmt1nmpf5003ivhhz6n6xjxyw/hls/seg0.ts"
head -c 8 /tmp/bbc.ts 2>/dev/null | od -An -tx1 || true

echo "=== PM2 ==="
pm2 list | grep -E 'nexlify|iptv-edge' || true
