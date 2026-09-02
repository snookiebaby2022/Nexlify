#!/bin/bash
set +e
cp -f /tmp/lg-smarters-fix/live-http-range.ts /opt/nexlify-panel/src/lib/live-http-range.ts
cp -f /tmp/lg-smarters-fix/client-playback-profiles.ts /opt/nexlify-panel/src/lib/client-playback-profiles.ts
cp -f /tmp/lg-smarters-fix/route.ts /opt/nexlify-panel/src/app/api/internal/live-auth/route.ts
echo 'files ok'
UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'
URL='http://127.0.0.1/live/000500000/000Leannj000/1307179470.ts'
echo '=== HEAD webos ==='
curl -sSI --max-time 10 -A "$UA" "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length' | head -6
echo '=== RANGE GET webos ==='
curl -sS -D - -o /tmp/lg-range.body --max-time 10 -A "$UA" -H 'Range: bytes=0-1' "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length' | head -6
echo 'range body:'; head -c 200 /tmp/lg-range.body; echo
echo '=== GET webos first lines ==='
curl -sS --max-time 8 -A "$UA" "$URL" | head -12
echo
echo '=== 8080 ==='
ss -ltnp | awk '/:8080 /{print; exit}'
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
