#!/usr/bin/env bash
set -euo pipefail
echo "=== External panel API ==="
curl -s -o /tmp/ext.json -w "HTTP:%{http_code}\n" \
  "https://panel.nexlify.live/player_api.php?username=test&password=test&action=get_live_categories"
head -c 120 /tmp/ext.json; echo

echo "=== Internal panel API ==="
curl -s -o /tmp/int.json -w "HTTP:%{http_code}\n" \
  "http://127.0.0.1:13000/player_api.php?username=test&password=test&action=get_live_categories"
head -c 120 /tmp/int.json; echo

echo "=== Marketing webplayer proxy (external panel URL) ==="
curl -s -o /tmp/proxy-ext.json -w "HTTP:%{http_code}\n" \
  "http://127.0.0.1:13001/api/webplayer/xtream?server=https%3A%2F%2Fpanel.nexlify.live&username=test&password=test&action=get_live_categories"
head -c 200 /tmp/proxy-ext.json; echo

echo "=== Marketing webplayer proxy (internal panel URL) ==="
curl -s -o /tmp/proxy-int.json -w "HTTP:%{http_code}\n" \
  "http://127.0.0.1:13001/api/webplayer/xtream?server=http%3A%2F%2F127.0.0.1%3A13000&username=test&password=test&action=get_live_categories"
head -c 200 /tmp/proxy-int.json; echo

echo "=== PM2 nexlify logs (last 30) ==="
pm2 logs nexlify --lines 30 --nostream 2>/dev/null || true
