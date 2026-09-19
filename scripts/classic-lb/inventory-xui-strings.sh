#!/usr/bin/env bash
set -euo pipefail
echo "=== nginx api/epg/xplugin ==="
grep -nE 'api\.php|xplugin|progress|epg|playlist|constants|init\.php|xmltv|get\.php|rtmp|play/' /home/xui/bin/nginx/conf/nginx.conf | head -60
echo
echo "=== strings www endpoints ==="
for f in api.php xplugin.php progress.php constants.php init.php playlist.php epg.php; do
  echo "---- $f ----"
  strings -n 5 "/home/xui/www/$f" 2>/dev/null | grep -iE 'action|username|password|progress|plugin|epg|xmltv|playlist|m3u|json|user_info|server_info|get_live|get_vod|download|bytes|offset|init|constant|version|xui' | head -25 || true
done
echo
echo "=== stream readable ==="
for f in key.php index.php rtmp.php subtitle.php thumb.php; do
  echo "---- stream/$f ----"
  head -40 "/home/xui/www/stream/$f" 2>/dev/null || true
  echo
done
echo "=== live.php first lines if ascii ==="
head -5 /home/xui/www/stream/live.php
file /home/xui/www/stream/*.php | head -20
