#!/bin/bash
# Deploy IPTV edge on 10gbs so upstream fetches use that IP (provider blocks 45).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL_BACKEND="${PANEL_BACKEND:-45.88.138.18:13000}"
PANEL_URL="${PANEL_URL:-http://45.88.138.18:13000}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:?Set INTERNAL_API_SECRET from panel .env}"

cd "$ROOT"
export PANEL_BACKEND PANEL_URL INTERNAL_API_SECRET AGENT_TOKEN="${AGENT_TOKEN:-}"

bash scripts/install-remote-edge-node.sh

echo "=== Test upstream from this host ==="
curl -s -m 15 -A 'VLC/3.0.20' -o /tmp/up.bin -w "upstream=%{http_code} bytes=%{size_download}\n" \
  "https://junki3monk3y.com/Blade2nd/PaaJhvNbqX/5" || true
head -c 4 /tmp/up.bin | xxd | head -1 || true

pm2 list 2>/dev/null | head -8 || systemctl status nexlify-iptv-edge --no-pager 2>/dev/null | head -5 || true
echo REMOTE_EDGE_OK
