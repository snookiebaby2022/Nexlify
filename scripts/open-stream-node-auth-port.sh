#!/bin/bash
# Allow stream nodes (10gbs) to reach panel live-auth on :13000 — XUI LB auth.
set -euo pipefail
cd /opt/nexlify-panel
STREAM_IP="${STREAM_IP:-209.237.141.15}"
PANEL_PORT="${PANEL_PORT:-13000}"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  ufw allow from "$STREAM_IP" to any port "$PANEL_PORT" proto tcp comment 'nexlify stream node auth' || true
  ufw reload 2>/dev/null || true
  echo "ufw: allowed ${STREAM_IP} -> :${PANEL_PORT}"
fi

if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp -s "$STREAM_IP" --dport "$PANEL_PORT" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp -s "$STREAM_IP" --dport "$PANEL_PORT" -j ACCEPT
  echo "iptables: allowed ${STREAM_IP} -> :${PANEL_PORT}"
fi

# Confirm panel listens externally (not only 127.0.0.1)
grep -q '^PANEL_BIND_HOST=' .env 2>/dev/null && sed -i 's/^PANEL_BIND_HOST=.*/PANEL_BIND_HOST=0.0.0.0/' .env || echo 'PANEL_BIND_HOST=0.0.0.0' >> .env

echo "test from panel:"
curl -s -m 5 "http://127.0.0.1:${PANEL_PORT}/api/health"; echo
echo STREAM_AUTH_OK
