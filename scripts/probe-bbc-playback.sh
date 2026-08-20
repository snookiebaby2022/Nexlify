#!/usr/bin/env bash
set -euo pipefail
U="${1:-Wardonet31}"
P="${2:-VftY9jVbNT}"
SID="${3:-1058467879}"
for URL in "http://127.0.0.1:13000/live/$U/$P/${SID}.ts" "http://127.0.0.1/live/$U/$P/${SID}.ts" "http://127.0.0.1:13000/live/$U/$P/${SID}.m3u8"; do
  echo "=== $URL ==="
  curl -sS -m 15 -A "XCIPTV/5.0.0" -w " http=%{http_code} bytes=%{size_download}\n" -o /tmp/p.bin "$URL" || echo "curl_fail"
  xxd /tmp/p.bin | head -3
  echo
done
