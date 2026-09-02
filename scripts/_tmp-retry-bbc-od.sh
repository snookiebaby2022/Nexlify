#!/bin/bash
for i in 1 2 3; do
  echo "try$i"
  curl -sS -o /dev/null -w "http=%{http_code} bytes=%{size_download} ttfb=%{time_starttransfer}\n" \
    --max-time 15 -H "User-Agent: VLC/3.0.20" \
    "http://127.0.0.1:8080/live/c56jaci21o/wcmpuUFJaSxb/1156229205.ts"
  sleep 1
done
