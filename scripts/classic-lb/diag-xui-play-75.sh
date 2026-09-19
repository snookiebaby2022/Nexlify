#!/usr/bin/env bash
# Run via plink/ssh on XUI host — inventory www/stream/nginx/php surfaces
set -euo pipefail
echo "=== host ==="
hostname; date -u; uname -a | head -1
echo
echo "=== xui tree top ==="
ls -la /home/xui 2>/dev/null | head -40 || ls -la /home 2>/dev/null | head
echo
echo "=== www root (Xtream endpoints) ==="
ls -la /home/xui/www 2>/dev/null | head -80
echo
echo "=== www/stream ==="
ls -la /home/xui/www/stream 2>/dev/null | head -60
echo
echo "=== php entrypoints (basename) ==="
find /home/xui/www -maxdepth 2 -type f \( -name '*.php' -o -name '*.py' \) 2>/dev/null | sort
echo
echo "=== nginx listen / includes ==="
ss -lntp 2>/dev/null | grep -E 'nginx|php|redis|mysql|ffmpeg|8090|8080|:80|:443' | head -40 || netstat -lntp 2>/dev/null | head -40
echo
echo "=== xui nginx conf snippets (locations) ==="
NGINX=$(find /home/xui -name 'nginx.conf' 2>/dev/null | head -3)
for n in $NGINX; do
  echo "--- $n ---"
  grep -nE 'listen |location |proxy_pass|fastcgi|live|timeshift|movie|series|auth|m3u8|\.ts' "$n" 2>/dev/null | head -80
done
# also bin nginx
if [ -f /home/xui/bin/nginx/conf/nginx.conf ]; then
  echo "--- /home/xui/bin/nginx/conf/nginx.conf locations ---"
  grep -nE 'listen |location |live|timeshift|movie|series|auth|panel_api|enigma2|subtitle|thumb|xmltv|player_api' /home/xui/bin/nginx/conf/nginx.conf | head -100
fi
echo
echo "=== conf.d / rtmp ==="
ls /home/xui/bin/nginx/conf/conf.d 2>/dev/null || true
ls /home/xui/bin/nginx/conf/rtmp* 2>/dev/null || true
find /home/xui/bin/nginx/conf -name '*.conf' 2>/dev/null | head -40
echo
echo "=== php-fpm pools ==="
ls /home/xui/bin/php/etc/php-fpm.d 2>/dev/null || ls /home/xui/bin/php*/etc/php-fpm.d 2>/dev/null || true
echo
echo "=== crons ==="
ls /home/xui/crons 2>/dev/null | head -40
echo
echo "=== content dirs ==="
ls /home/xui/content 2>/dev/null | head -30
echo
echo "=== processes ==="
ps aux | grep -iE 'xui|nginx|ffmpeg|php-fpm|redis' | grep -v grep | head -40
echo
echo "=== running? ports detail ==="
ss -lntp 2>/dev/null | head -50
