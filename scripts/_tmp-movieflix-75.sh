#!/bin/bash
set +e
echo "=== dns ==="
getent ahostsv4 movieflix.live | head -5
getent ahostsv4 snookiebaby.xyz | head -5
echo server75=75.119.137.174
echo "=== origin direct (bypass cf) ==="
for host in snookiebaby.xyz movieflix.live; do
  echo "-- $host on 75 --"
  curl -sS -m 10 -o /tmp/o.out -w "direct_ip %{http_code} ct:%{content_type}\n" --resolve "${host}:443:75.119.137.174" "https://${host}/api/health" -k
  head -c 180 /tmp/o.out; echo
  curl -sS -m 10 -o /tmp/o2.out -w "home %{http_code}\n" --resolve "${host}:443:75.119.137.174" "https://${host}/" -k
done
echo "=== public ==="
for u in https://movieflix.live/api/health https://snookiebaby.xyz/api/health https://movieflix.live/ https://snookiebaby.xyz/; do
  curl -sS -m 12 -o /tmp/p.out -w "$u -> %{http_code} ct:%{content_type} bytes:%{size_download}\n" "$u" || echo "$u FAIL"
  head -c 120 /tmp/p.out; echo; echo ---
done
echo "=== nginx server blocks 443 ==="
nginx -T 2>/dev/null | awk '/listen 443|server_name/{print}' | head -30
echo "=== le certs ==="
ls -1 /etc/letsencrypt/live 2>/dev/null
