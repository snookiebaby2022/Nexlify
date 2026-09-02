#!/bin/bash
U=c56jaci21o
P=wcmpuUFJaSxb
probe() {
  name=$1 id=$2
  echo "=== $name ($id) ==="
  curl -sS -o /dev/null -w "http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}s time=%{time_total}s\n" \
    --max-time 20 -H "User-Agent: VLC/3.0.20" \
    "http://127.0.0.1:8080/live/$U/$P/$id.ts"
}
probe "BBC-OD" 1156229205
probe "BBC-LIVE" 101673249
probe "ITV" 310966199
probe "HEVC-HB" 69816933
probe "HEVC-LB" 733073773
