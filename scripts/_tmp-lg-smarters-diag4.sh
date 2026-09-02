#!/bin/bash
set +e
UA_LG='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'
UA_SM='IPTVSmartersPlayer'
URL='http://127.0.0.1/live/000500000/000Leannj000/1307179470.ts'
URL10='http://209.237.141.15:8080/live/000500000/000Leannj000/1307179470.ts'

echo '=== HEAD local nginx ==='
curl -sSI --max-time 8 -A "$UA_LG" "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length|location'
echo '=== GET range 0-1 local ==='
curl -sSI --max-time 8 -A "$UA_LG" -H 'Range: bytes=0-1' "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length|content-range|location'
echo '=== GET range 0-1023 local ==='
curl -sSI --max-time 8 -A "$UA_LG" -H 'Range: bytes=0-1023' "$URL" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length|content-range|location'
echo '=== GET 32 bytes local webos ==='
curl -sS --max-time 8 -A "$UA_LG" -o /tmp/lg-probe.ts -w 'code=%{http_code} bytes=%{size_download} type=%{content_type}\n' --range 0-31 "$URL"
xxd /tmp/lg-probe.ts | head -2
echo '=== GET 32 bytes no range webos ==='
curl -sS --max-time 8 -A "$UA_LG" -o /tmp/lg-probe2.ts -w 'code=%{http_code} bytes=%{size_download} type=%{content_type}\n' "$URL"
# curl without range still downloads until max-time; use max-filesize
echo '=== GET 32 via 10gbs direct HEAD ==='
curl -sSI --max-time 8 -A "$UA_LG" "$URL10" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length|location'
echo '=== GET range 0-1 10gbs ==='
curl -sSI --max-time 8 -A "$UA_LG" -H 'Range: bytes=0-1' "$URL10" | tr -d '\r' | grep -iE 'HTTP/|content-type|content-length|content-range|location'
echo '=== m3u8 webos vs smarters first 15 lines ==='
curl -sS --max-time 8 -A "$UA_LG" 'http://127.0.0.1/live/000500000/000Leannj000/1307179470.m3u8' | head -15
echo '---'
curl -sS --max-time 8 -A "$UA_SM" 'http://127.0.0.1/live/000500000/000Leannj000/1307179470.m3u8' | head -15
