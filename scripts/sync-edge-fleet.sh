#!/usr/bin/env bash
# Push edge install to multiple VPS hosts over SSH.
#
#   EDGE_HOSTS="root@45.88.138.18,root@10.0.0.6" \
#   PANEL_BACKEND=10.0.0.5:13000 \
#   INTERNAL_API_SECRET=... \
#   bash scripts/sync-edge-fleet.sh
#
# Requires passwordless SSH or ssh-agent. Uses git pull on each host if repo exists.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EDGE_HOSTS="${EDGE_HOSTS:-}"
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
PANEL_BACKEND="${PANEL_BACKEND:-}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-}"

if [ -z "$EDGE_HOSTS" ]; then
  echo "ERROR: EDGE_HOSTS=user@host1,user@host2"
  exit 1
fi

IFS=',' read -ra HOSTS <<< "$EDGE_HOSTS"
for h in "${HOSTS[@]}"; do
  h="$(echo "$h" | xargs)"
  [ -z "$h" ] && continue
  echo "=== sync edge $h ==="
  ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$h" bash -s <<REMOTE
set -euo pipefail
PANEL_DIR="${PANEL_DIR}"
if [ ! -d "\$PANEL_DIR/.git" ]; then
  echo "ERROR: no git repo at \$PANEL_DIR on $h"
  exit 1
fi
cd "\$PANEL_DIR"
git fetch origin main && git reset --hard origin/main
sed -i 's/\\r\$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/install-remote-edge-node.sh scripts/tune-kernel-20k.sh
PANEL_BACKEND="${PANEL_BACKEND}" INTERNAL_API_SECRET="${INTERNAL_API_SECRET}" \\
  bash scripts/install-remote-edge-node.sh
REMOTE
done
echo "[sync-edge-fleet] done"
