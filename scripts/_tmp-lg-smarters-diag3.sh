#!/bin/bash
set +e
echo '=== Web0S status codes ==='
grep -hF Web0S /var/log/nginx/access.log | awk '{print $9}' | sort | uniq -c | sort -nr | head
echo
echo '=== Web0S first path segment ==='
grep -hF Web0S /var/log/nginx/access.log | awk '{print $7}' | awk -F'[/?]' '{print $2}' | sort | uniq -c | sort -nr | head -25
echo
echo '=== Web0S live extensions ==='
grep -hF Web0S /var/log/nginx/access.log | grep ' /live/' | sed -n 's/.*\/live\/[^ ]*//p' | awk '{print $1}' | sed 's/.*\.//' | sort | uniq -c | sort -nr | head
echo
echo '=== sample Web0S live/movie lines ==='
grep -hE 'Web0S' /var/log/nginx/access.log | grep -E ' /live/| /movie/| /series/|player_api|get.php' | tail -20
echo
echo '=== Web0S player_api login status ==='
grep -hF Web0S /var/log/nginx/access.log | grep player_api.php | grep -v action= | awk '{print $9}' | sort | uniq -c
echo
echo '=== Tizen sample ==='
grep -hF Tizen /var/log/nginx/access.log | awk '{print $7,$9}' | awk -F'[/? ]' '{print $2,$NF}' | sort | uniq -c | sort -nr | head -15
echo
echo '=== probe formats ==='
python3 - <<'PY'
import json,urllib.request
def formats(ua):
    req=urllib.request.Request('http://127.0.0.1/player_api.php?username=000500000&password=000Leannj000', headers={'User-Agent':ua})
    with urllib.request.urlopen(req, timeout=8) as r:
        d=json.load(r)
    ui=d.get('user_info') or {}
    si=d.get('server_info') or {}
    print(ua[:50], 'auth', ui.get('auth'), 'fmt', ui.get('allowed_output_formats'), 'port', si.get('port'), 'proto', si.get('server_protocol'), 'url', si.get('url'))
formats('IPTVSmartersPlayer')
formats('Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager')
PY
echo
echo '=== content-type probes ==='
curl -sSI --max-time 8 -A 'IPTVSmartersPlayer' 'http://127.0.0.1/live/000500000/000Leannj000/1307179470.ts' | tr -d '\r' | grep -iE 'HTTP/|content-type|location'
echo '--- m3u8 smarters ---'
curl -sSI --max-time 8 -A 'IPTVSmartersPlayer' 'http://127.0.0.1/live/000500000/000Leannj000/1307179470.m3u8' | tr -d '\r' | grep -iE 'HTTP/|content-type|location'
echo '--- m3u8 webos body ---'
curl -sS --max-time 10 -A 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager' \
  'http://127.0.0.1/live/000500000/000Leannj000/1307179470.m3u8' | head -25
echo
echo '--- ts first bytes webos ---'
curl -sS --max-time 6 -A 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager' \
  'http://127.0.0.1/live/000500000/000Leannj000/1307179470.ts' | python3 -c 'import sys; b=sys.stdin.buffer.read(16); print(b[:1].hex() if b else "empty", "len", len(b), "sync47" if b[:1]==b"\x47" else b[:16])'
