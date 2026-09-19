#!/usr/bin/env bash
set -euo pipefail
echo "=== host ==="
hostname; date -u
echo
echo "=== /home/xui ==="
ls -la /home/xui 2>/dev/null | head -40
echo
echo "=== www ==="
ls -la /home/xui/www 2>/dev/null | head -100
echo
echo "=== www/stream ==="
ls -la /home/xui/www/stream 2>/dev/null | head -80
echo
echo "=== all php under www (depth 3) ==="
find /home/xui/www -maxdepth 3 -type f -name '*.php' 2>/dev/null | sort
echo
echo "=== nginx confs ==="
find /home/xui/bin/nginx/conf -type f -name '*.conf' 2>/dev/null | sort
echo
if [ -f /home/xui/bin/nginx/conf/nginx.conf ]; then
  echo "=== nginx.conf listen/location hits ==="
  grep -nE 'listen |location |live|timeshift|movie|series|auth|player_api|panel_api|enigma2|subtitle|thumb|xmltv|get\.php|streaming' \
    /home/xui/bin/nginx/conf/nginx.conf | head -120
fi
echo
echo "=== conf.d contents ==="
for f in /home/xui/bin/nginx/conf/conf.d/*.conf; do
  [ -f "$f" ] || continue
  echo "--- $f ---"
  grep -nE 'listen |location |proxy_pass|fastcgi|live|timeshift|movie|series|auth|\.ts|m3u8' "$f" | head -60
done
echo
echo "=== php-fpm pools ==="
ls -la /home/xui/bin/php/etc/php-fpm.d 2>/dev/null || ls -la /home/xui/bin/php/*/etc/php-fpm.d 2>/dev/null || true
echo
echo "=== crons ==="
ls /home/xui/crons 2>/dev/null
echo
echo "=== content ==="
ls /home/xui/content 2>/dev/null
echo
echo "=== listening ports ==="
ss -lntp 2>/dev/null | head -60 || true
echo
echo "=== xui processes ==="
ps aux | grep -iE 'xui|nginx|ffmpeg|php-fpm|redis-server' | grep -v grep | head -40 || true
echo
echo "=== includes top ==="
ls /home/xui/includes 2>/dev/null | head -40
echo
echo "=== stream php function names (strings) ==="
for f in /home/xui/www/stream/*.php; do
  [ -f "$f" ] || continue
  echo "-- $(basename "$f") size=$(stat -c%s "$f") --"
  # ionCube often — still list file
done
ls -la /home/xui/www/*.php 2>/dev/null
