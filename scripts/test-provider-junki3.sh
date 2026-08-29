#!/bin/bash
set -euo pipefail
U=Blade2nd
P=PaaJhvNbqX
HOST=junki3monk3y.com
UA='VLC/3.0.20 LibVLC/3.0.20'

echo "=== player_api login ==="
curl -s -m 15 -w " http=%{http_code}\n" "https://${HOST}/player_api.php?username=${U}&password=${P}" | head -c 400; echo

echo "=== URL format tests ==="
for URL in \
  "https://${HOST}/${U}/${P}/5" \
  "https://${HOST}/live/${U}/${P}/5.ts" \
  "http://${HOST}/live/${U}/${P}/5.ts" \
  "https://${HOST}:443/${U}/${P}/5.ts" \
  "http://${HOST}/${U}/${P}/5.ts"
do
  curl -s -m 12 -A "$UA" -o /tmp/fmt.bin -w "${URL} -> %{http_code} bytes=%{size_download} ct=%{content_type}\n" "$URL"
  head -c 4 /tmp/fmt.bin | xxd | head -1 || true
done

echo "=== get_live_streams sample ==="
curl -s -m 20 "https://${HOST}/player_api.php?username=${U}&password=${P}&action=get_live_streams" | node -e "try{const j=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('count',j.length);console.log(JSON.stringify(j[0],null,2))}catch(e){console.log('parse fail')}" 2>/dev/null || true
