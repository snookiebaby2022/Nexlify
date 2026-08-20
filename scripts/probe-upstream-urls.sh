#!/usr/bin/env bash
set -euo pipefail
UA="VLC/3.0.20 LibVLC/3.0.20"
for URL in \
  "http://zee-portal.xyz/ghostface/bHwC552glfki2026/254808" \
  "http://zee-portal.xyz/ghostface/bHwC552glfki2026/254808.m3u8" \
  "http://xplanetdrm.icu:8080/Ghostface26/48442824/7779.m3u8"; do
  echo "=== $URL ==="
  curl -sS -m 10 -A "$UA" -w " http=%{http_code} bytes=%{size_download}\n" -o /tmp/u.bin "$URL" || echo curl_fail
  xxd /tmp/u.bin | head -2
done
