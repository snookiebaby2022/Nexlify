#!/usr/bin/env bash
# Quick OBS / RTMP diagnostics for nexlify.live livestream
set -uo pipefail

echo "=== Nexlify livestream diagnostics ==="
echo ""

echo "--- nginx ---"
nginx -t 2>&1 || true
echo ""
grep -n 'nexlify.live-rtmp-hls\|ngx_rtmp' /etc/nginx/nginx.conf 2>/dev/null || echo "(no rtmp lines in nginx.conf)"
ls -la /etc/nginx/modules-enabled/*rtmp* 2>/dev/null || echo "(no modules-enabled rtmp)"
echo ""

echo "--- port 1935 (must show nginx listening) ---"
ss -tlnp | grep 1935 || echo "NOT LISTENING — RTMP ingest is down"
echo ""

echo "--- HLS directory ---"
ls -la /var/www/nexlify-hls/ 2>/dev/null || echo "Missing /var/www/nexlify-hls"
echo ""

echo "--- firewall ---"
ufw status 2>/dev/null | grep 1935 || echo "(ufw: no 1935 rule or ufw inactive)"
echo ""

echo "--- DNS (run from your PC too) ---"
for h in rtmp.nexlify.live nexlify.live; do
  echo -n "$h -> "
  getent ahosts "$h" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || echo "lookup failed"
  echo ""
done
echo ""

echo "--- marketing env (RTMP URL + key) ---"
ENV=/var/www/nexlify/.env
if [ -f "$ENV" ]; then
  grep -E '^LIVESTREAM_|^NEXT_PUBLIC_LIVESTREAM_' "$ENV" || echo "(no LIVESTREAM_* vars set)"
else
  echo "Missing $ENV"
fi
echo ""

echo "--- OBS should use ---"
echo "  Service:    Custom"
echo "  Server:     rtmp://rtmp.nexlify.live/live   (NOT rtmps:// unless you configured TLS)"
echo "  Stream key: nexlify  (must match LIVESTREAM_STREAM_KEY and HLS filename)"
echo ""
echo "--- after OBS starts, expect ---"
echo "  ls /var/www/nexlify-hls/   → .m3u8 and .ts files"
echo "  curl -s https://nexlify.live/hls/nexlify.m3u8 | head"
