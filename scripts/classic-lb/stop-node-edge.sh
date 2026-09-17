#!/usr/bin/env bash
# Stop nexlify-iptv-edge (Node splice) so nginx classic LB owns media ports.
set -euo pipefail
if command -v pm2 >/dev/null 2>&1; then
  pm2 stop nexlify-iptv-edge 2>/dev/null || true
  pm2 delete nexlify-iptv-edge 2>/dev/null || true
  pm2 save 2>/dev/null || true
fi
systemctl stop nexlify-iptv-edge 2>/dev/null || true
systemctl disable nexlify-iptv-edge 2>/dev/null || true
echo "NODE_EDGE_STOPPED — classic LB nginx should own media (:8080 dedicated LB, or :8090 when co-located with panel)"
ss -ltnp | grep -E ':8080|:8090|:25461' || true
