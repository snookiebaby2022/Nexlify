#!/usr/bin/env bash
set -uo pipefail

echo "=== Nexlify livestream remote diagnose ==="
echo ""

echo "--- PM2 ---"
pm2 status nexlify-web 2>/dev/null || true
echo ""

echo "--- Ports ---"
ss -tlnp | grep -E ':3001|:1935' || echo "(nothing on 3001/1935)"
echo ""

echo "--- HLS files ---"
ls -la /var/www/nexlify-hls/ 2>/dev/null || echo "missing /var/www/nexlify-hls"
echo ""

echo "--- nginx RTMP include ---"
grep -n 'nexlify.live-rtmp-hls\|hls_fragment' /etc/nginx/nexlify.live-rtmp-hls.conf 2>/dev/null | head -10 || echo "no rtmp conf"
nginx -t 2>&1 | tail -2
echo ""

echo "--- HTTP checks ---"
curl -sS -o /dev/null -w "3001 /livestream → %{http_code}\n" http://127.0.0.1:3001/livestream || true
curl -sS -o /dev/null -w "3001 /api/livestream/status → %{http_code}\n" http://127.0.0.1:3001/api/livestream/status || true
curl -sS http://127.0.0.1:3001/api/livestream/status 2>/dev/null || true
echo ""
curl -sS -o /dev/null -w "local HLS manifest → %{http_code}\n" http://127.0.0.1/hls/nexlify.m3u8 2>/dev/null || \
  curl -sS -o /dev/null -w "file HLS → " && head -3 /var/www/nexlify-hls/nexlify.m3u8 2>/dev/null || echo "no manifest"
echo ""

echo "--- env ---"
grep -E '^LIVESTREAM_|^NEXT_PUBLIC_LIVESTREAM_' /var/www/nexlify/.env 2>/dev/null || echo "(no LIVESTREAM vars)"
echo ""

echo "--- pm2 logs (last 15 lines) ---"
pm2 logs nexlify-web --lines 15 --nostream 2>/dev/null || true
