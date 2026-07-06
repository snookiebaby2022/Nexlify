#!/bin/bash
cd /opt/nexlify-panel

echo "=== STREAMING ERROR LOGS ==="
pm2 logs nexlify --lines 50 --nostream 2>&1 | grep -iE "stream|live|proxy|timeout|ECONNREFUSED|error|502|504" | tail -20

echo ""
echo "=== FIREWALL ==="
ufw status 2>/dev/null || echo "ufw not active"

echo ""
echo "=== TEST FULL STREAM FLOW ==="
# Simulate an IPTV player request
curl -v -H 'User-Agent: MLA/2.1 (Linux; Android 12)' 'http://75.119.137.174/player_api.php?username=test&password=test&action=get_live_categories' 2>&1 | grep -E "HTTP|Location|content-type|error" | head -10

echo ""
echo "=== PANEL STREAM CONFIG ==="
grep -iE 'STREAM|FFMPEG|PROXY|BUFFER' .env
