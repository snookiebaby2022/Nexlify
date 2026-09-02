#!/bin/bash
set -euo pipefail
echo '=== IPv6 listen 80/443/8080 ==='
ss -ltnp | grep -E ':80 |:443|:8080' | head -20
echo
echo '=== Web0S / tizen / smarttv counts (access.log*) ==='
for pat in Web0S webOS webos SmartTV smart-tv Tizen NetCast 'LG Browser' WebAppManager; do
  n=$(grep -c "$pat" /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')
  echo "  $pat: $n"
done
echo
echo '=== sample Web0S/tizen lines ==='
grep -hE 'Web0S|webOS|Tizen|NetCast|WebAppManager' /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null | awk '{print $1,$4,$7,$9,$NF}' | tail -40
echo
echo '=== player_api UAs last 2 logs ==='
grep -h 'player_api.php' /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null | awk -F'"' '{ua=$(NF-1); print ua}' | sort | uniq -c | sort -nr | head -30
echo
echo '=== live .m3u8 vs .ts for Smarters ==='
echo -n 'smarters .ts: '; grep -hE 'IPTVSmarters|smarters' /var/log/nginx/access.log | grep -c '\.ts ' || true
echo -n 'smarters .m3u8: '; grep -hE 'IPTVSmarters|smarters' /var/log/nginx/access.log | grep -c '\.m3u8' || true
echo
echo '=== 502 on live today ==='
grep -h 'GET /live/' /var/log/nginx/access.log | awk '$9==502 {c++} END {print "502", c+0}'
grep -h 'GET /live/' /var/log/nginx/access.log | awk '$9==200 {c++} END {print "200", c+0}'
echo
echo '=== nginx live content-type / 10gbs upstream ==='
grep -nE 'upstream|nexlify_remote_edge|proxy_set_header' /etc/nginx/conf.d/nexlify-live-remote-edge.conf | head -40
echo
echo '=== probe Content-Type .ts vs .m3u8 (HEAD via local) ==='
# Use a recently-working live path from logs without printing password in output labels
curl -sSI --max-time 8 -A 'IPTVSmartersPlayer' 'http://127.0.0.1/live/000500000/000Leannj000/1307179470.ts' | tr -d '\r' | grep -iE 'HTTP/|content-type|location|content-length'
echo '--- m3u8 ---'
curl -sSI --max-time 8 -A 'IPTVSmartersPlayer' 'http://127.0.0.1/live/000500000/000Leannj000/1307179470.m3u8' | tr -d '\r' | grep -iE 'HTTP/|content-type|location|content-length'
echo '--- webos m3u8 body first lines ---'
curl -sS --max-time 8 -A 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager' \
  'http://127.0.0.1/live/000500000/000Leannj000/1307179470.m3u8' | head -20
echo
echo '--- player_api formats smarters vs webos ---'
UA1='IPTVSmartersPlayer'
UA2='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager'
for UA in "$UA1" "$UA2"; do
  echo "UA=${UA:0:40}"
  curl -sS --max-time 8 -A "$UA" 'http://127.0.0.1/player_api.php?username=000500000&password=000Leannj000' \
    | python3 -c 'import sys,json
d=json.load(sys.stdin)
ui=d.get("user_info") or {}
si=d.get("server_info") or {}
print("auth", ui.get("auth"), "status", ui.get("status"), "formats", ui.get("allowed_output_formats"), "port", si.get("port"), "proto", si.get("server_protocol"), "https_port", si.get("https_port"), "url", si.get("url"))'
done
