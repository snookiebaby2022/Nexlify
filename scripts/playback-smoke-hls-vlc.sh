#!/usr/bin/env bash
# Smoke test MPEG-TS, HLS, and VLC-style playback on server 45.
set -euo pipefail
cd /opt/nexlify-panel

USER="${SMOKE_USER:-_smoke_test}"
PASS="${SMOKE_PASS:-SmokeTest2026!}"
STREAM="${SMOKE_STREAM:-1860155862}"
HOST="${SMOKE_HOST:-45.88.138.18}"

probe() {
  local label="$1"
  local url="$2"
  local ua="${3:-VLC/3.0.20 LibVLC/3.0.20}"
  local extra="${4:-}"
  echo ""
  echo "--- $label ---"
  echo "GET $url"
  local head
  head=$(curl -sS -m 10 -I -A "$ua" $extra "$url" 2>/dev/null | tr -d '\r' | head -20)
  echo "$head" | grep -E '^(HTTP/|Content-Type|Accept-Ranges|Content-Length|Content-Range)' || echo "$head"
  local body="/tmp/smoke-$$-$(echo "$label" | tr ' /' '__')"
  local meta
  meta=$(curl -sS -m 20 -A "$ua" $extra -o "$body" -w "http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}" "$url" 2>/dev/null || echo "http=000 bytes=0 ttfb=0")
  echo "$meta"
  if [ -f "$body" ] && [ "$(wc -c < "$body" | tr -d ' ')" -gt 0 ]; then
    if grep -q '#EXTM3U' "$body" 2>/dev/null; then
      echo "playlist:"
      head -8 "$body"
    else
      xxd "$body" 2>/dev/null | head -2 || true
    fi
  fi
  rm -f "$body"
}

echo "=== playback smoke (TS + HLS + VLC) ==="
echo "host=$HOST user=$USER stream=$STREAM"

probe "edge TS (Exo)" "http://${HOST}/live/${USER}/${PASS}/${STREAM}.ts" "IPTV Smarters/1.0"
probe "edge TS (VLC)" "http://${HOST}/live/${USER}/${PASS}/${STREAM}.ts" "VLC/3.0.20 LibVLC/3.0.20"
probe "edge TS VLC+Range" "http://${HOST}/live/${USER}/${PASS}/${STREAM}.ts" "VLC/3.0.20 LibVLC/3.0.20" "-H Range: bytes=0-"
probe "edge HLS m3u8" "http://${HOST}/live/${USER}/${PASS}/${STREAM}.m3u8" "IPTV Smarters/1.0"
probe "edge HLS VLC" "http://${HOST}/live/${USER}/${PASS}/${STREAM}.m3u8" "VLC/3.0.20 LibVLC/3.0.20"
probe "panel HLS direct" "http://127.0.0.1:13000/live/${USER}/${PASS}/${STREAM}.m3u8" "VLC/3.0.20 LibVLC/3.0.20"

echo ""
echo "=== done ==="
