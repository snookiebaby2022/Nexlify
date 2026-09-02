#!/bin/bash
set -euo pipefail
cd /home/nexlify
git fetch origin main
git log -1 --oneline origin/main
export PANEL_DIR=/home/nexlify
export NEXLIFY_FORCE_BUILD=1
export NEXLIFY_FORCE_RESTART=1
nohup env PANEL_DIR=/home/nexlify NEXLIFY_FORCE_BUILD=1 NEXLIFY_FORCE_RESTART=1 bash scripts/rebuild-panel-safe.sh > /tmp/nexlify-45-parity-85-demo.log 2>&1 </dev/null &
echo REBUILD85:$!
sleep 1
head -6 /tmp/nexlify-45-parity-85-demo.log || true
