#!/bin/bash
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
cd "$PANEL_DIR"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh
bash scripts/fix-stream-edge-now.sh 2>/dev/null || bash scripts/install-nginx-stream-edge.sh
bash scripts/nexlify-firewall-ports.sh
bash scripts/sync-panel-ports.sh
bash scripts/verify-panel-ports.sh || true
grep '"version"' package.json | head -1
systemctl is-active nginx || true
echo CUSTOMER_PORT_FIX_OK
