#!/bin/bash
cd /opt/nexlify-panel
PORT=$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- | tr -d '"')
PORT=${PORT:-13000}
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
for host in darkcdn.store darkcdn.art Sulu.xyz n17y1d.xyz; do
  echo "=== $host ==="
  curl -sS -o /dev/null -w "login:%{http_code} " --max-time 8 -H "Host: $host" -A "$UA" "http://127.0.0.1:${PORT}/login"
  curl -sS -o /dev/null -w "root:%{http_code} " --max-time 8 -H "Host: $host" -A "$UA" "http://127.0.0.1:${PORT}/"
  curl -sS -o /dev/null -w "reseller:%{http_code}\n" --max-time 8 -H "Host: $host" -A "$UA" "http://127.0.0.1:${PORT}/reseller/dashboard"
done
