#!/bin/bash
set +e
echo "=== moviestream nginx ==="
cat /etc/nginx/sites-available/moviestream 2>/dev/null | head -80
echo "=== nexlify demo nginx ==="
grep -E 'server_name|listen|proxy_pass|root' /etc/nginx/sites-available/nexlify-panel-demo 2>/dev/null | head -20
echo "=== backend probes ==="
curl -sS -m 5 -o /dev/null -w 'api3001:%{http_code} ttfb:%{time_starttransfer}\n' http://127.0.0.1:3001/ 2>&1
curl -sS -m 5 -o /dev/null -w 'nginx8090:%{http_code} ttfb:%{time_starttransfer}\n' http://127.0.0.1:8090/ 2>&1
echo "=== host probes ==="
for host in movieflix.live www.movieflix.live flixnova.live www.flixnova.live moviestream.live; do
  code=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' -H "Host: $host" http://127.0.0.1/ 2>/dev/null)
  echo "http Host:$host -> $code"
  code2=$(curl -sS -m 8 -o /dev/null -w '%{http_code}' -k -H "Host: $host" https://127.0.0.1/ 2>/dev/null)
  echo "https Host:$host -> $code2"
done
echo "=== public dns ==="
for host in movieflix.live flixnova.live; do
  getent hosts "$host" 2>/dev/null || true
  curl -sS -m 10 -o /dev/null -w "public https $host:%{http_code} ttfb:%{time_starttransfer}\n" "https://$host/" 2>&1
done
echo "=== pm2 moviestream port ==="
ss -tlnp | grep -E '3001|8090|8091' || true
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print([(x.get("name"), x.get("pm2_env",{}).get("status")) for x in d])'
