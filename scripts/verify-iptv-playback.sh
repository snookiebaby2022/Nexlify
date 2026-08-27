#!/usr/bin/env bash
# Smoke-test live / VOD / series playback through the IPTV edge.
# Usage: verify-iptv-playback.sh [username] [password] [base_url]
set -euo pipefail

U="${1:-lucky15}"
P="${2:-chedpie30}"
B="${3:-http://127.0.0.1:8080}"
B="${B%/}"

log() { echo "[iptv-probe] $*"; }
fail=0

curl_json() {
  curl -sS --compressed --max-time 30 "$@"
}

log "user=$U base=$B"

curl_json "$B/player_api.php?username=$U&password=$P&action=get_live_streams" > /tmp/iptv-live.json
curl_json "$B/player_api.php?username=$U&password=$P&action=get_vod_streams" > /tmp/iptv-vod.json
curl_json "$B/player_api.php?username=$U&password=$P&action=get_series" > /tmp/iptv-series.json

node <<'NODE'
const fs = require("fs");
function load(p) {
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes('"error"')) throw new Error(p + " auth/catalog error: " + raw.slice(0, 120));
  return JSON.parse(raw);
}
const live = load("/tmp/iptv-live.json");
const vod = load("/tmp/iptv-vod.json");
const ser = load("/tmp/iptv-series.json");
const pick = (arr, pred) => arr.find(pred) || arr[0];
const L = pick(live, (s) => s.stream_id && !(String(s.name || "").includes("BBC One")));
const V = pick(vod, (s) => s.stream_id);
const S = pick(ser, (s) => s.series_id);
console.log("LIVE", L?.stream_id, (L?.name || "").slice(0, 50));
console.log("VOD", V?.stream_id, (V?.name || "").slice(0, 50), V?.container_extension || "mp4");
console.log("SERIES", S?.series_id, (S?.name || "").slice(0, 50));
fs.writeFileSync(
  "/tmp/iptv-ids.json",
  JSON.stringify({
    live: L?.stream_id,
    vod: V?.stream_id,
    vext: V?.container_extension || "mp4",
    series: S?.series_id,
  })
);
NODE

LIVE_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/iptv-ids.json')).live")
VOD_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/iptv-ids.json')).vod")
VOD_EXT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/iptv-ids.json')).vext")
SERIES_ID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/iptv-ids.json')).series")

check_magic() {
  local file="$1" label="$2"
  local first
  first=$(head -c 1 "$file" | od -An -tu1 | tr -d ' ')
  if [ "$first" = "71" ]; then
    log "OK $label MPEG-TS sync 0x47"
  else
    log "WARN $label first byte $first (expected 0x47)"
    fail=1
  fi
}

log "=== LIVE $LIVE_ID ==="
code=$(curl -sS -o /tmp/iptv-live.ts -w '%{http_code}' --max-time 15 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${LIVE_ID}.ts" || echo 000)
size=$(wc -c < /tmp/iptv-live.ts | tr -d ' ')
log "live.ts HTTP $code ${size}B"
if [ "$code" != "200" ] || [ "${size:-0}" -lt 100000 ]; then fail=1; fi
check_magic /tmp/iptv-live.ts "live.ts"

m3u8_code=$(curl -sS -o /tmp/iptv-live.m3u8 -w '%{http_code}' --max-time 10 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${LIVE_ID}.m3u8" || echo 000)
log "live.m3u8 HTTP $m3u8_code"
if [ "$m3u8_code" != "200" ]; then fail=1; fi

seg_code=$(curl -sS -o /tmp/iptv-seg0.ts -w '%{http_code}' --max-time 20 \
  -H "User-Agent: IPTV Smarters" "$B/live/$U/$P/${LIVE_ID}/hls/seg0.ts" || echo 000)
seg_size=$(wc -c < /tmp/iptv-seg0.ts 2>/dev/null | tr -d ' ' || echo 0)
log "seg0.ts HTTP $seg_code ${seg_size}B"
if [ "$seg_code" != "200" ] || [ "${seg_size:-0}" -lt 1000 ]; then fail=1; fi

log "=== VOD $VOD_ID ==="
vod_code=$(curl -sS -o /tmp/iptv-vod.bin -w '%{http_code}' --max-time 25 \
  -H "User-Agent: VLC/3.0.20 LibVLC/3.0.20" "$B/movie/$U/$P/${VOD_ID}.${VOD_EXT}" -r 0-500000 || echo 000)
vod_size=$(wc -c < /tmp/iptv-vod.bin | tr -d ' ')
log "movie HTTP $vod_code ${vod_size}B"
if [ "$vod_code" != "206" ] && [ "$vod_code" != "200" ]; then fail=1; fi

log "=== SERIES $SERIES_ID ==="
curl_json "$B/player_api.php?username=$U&password=$P&action=get_series_info&series_id=$SERIES_ID" > /tmp/iptv-sinfo.json
node <<'NODE'
const d = JSON.parse(require("fs").readFileSync("/tmp/iptv-sinfo.json", "utf8"));
const eps = d.episodes || {};
for (const k of Object.keys(eps)) {
  const e = eps[k]?.[0];
  if (e) {
    require("fs").writeFileSync(
      "/tmp/iptv-ep.json",
      JSON.stringify({ id: e.id || e.stream_id, ext: e.container_extension || "mp4" })
    );
    console.log("EP", e.id || e.stream_id, (e.title || "").slice(0, 40));
    process.exit(0);
  }
}
console.log("NO_EPISODES");
NODE

if [ -f /tmp/iptv-ep.json ]; then
  EID=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/iptv-ep.json')).id")
  EEXT=$(node -p "JSON.parse(require('fs').readFileSync('/tmp/iptv-ep.json')).ext")
  ser_code=$(curl -sS -o /tmp/iptv-ser.bin -w '%{http_code}' --max-time 25 \
    -H "User-Agent: VLC/3.0.20 LibVLC/3.0.20" "$B/series/$U/$P/${EID}.${EEXT}" -r 0-500000 || echo 000)
  ser_size=$(wc -c < /tmp/iptv-ser.bin | tr -d ' ')
  log "series HTTP $ser_code ${ser_size}B"
  if [ "$ser_code" != "206" ] && [ "$ser_code" != "200" ]; then fail=1; fi
fi

log "=== panel health ==="
curl -sS -m 4 -o /dev/null -w "health HTTP %{http_code}\n" "http://127.0.0.1:13000/api/health" || true

if [ "$fail" -eq 0 ]; then
  log "PASS"
  exit 0
fi
log "FAIL — see lines above"
exit 1
