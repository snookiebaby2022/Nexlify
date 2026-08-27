#!/usr/bin/env bash
set -euo pipefail
echo "=== enabled ==="
ls -la /etc/nginx/sites-enabled/
echo "=== grep billing ==="
grep -Rnl 'billing.nexlify' /etc/nginx/ || true
echo "=== parked file ==="
cat /etc/nginx/sites-available/billing.nexlify.live.parked
echo "=== http headers ==="
curl -sSI -H 'Host: billing.nexlify.live' http://127.0.0.1/ | head -20
echo "=== https headers ==="
curl -skSI -H 'Host: billing.nexlify.live' https://127.0.0.1/ | head -25
echo "=== server_name match ==="
nginx -T 2>/dev/null | grep -n 'server_name billing' -A2 || true
