#!/bin/bash
set -uo pipefail
cd /opt/nexlify-panel

echo "=== TCP 10gbs:8080 ==="
timeout 3 bash -c 'echo > /dev/tcp/209.237.141.15/8080' && echo open || echo closed/timeout

echo "=== 10gbs diag via node ==="
node scripts/diag-10gbs-connectivity.cjs 2>&1 | tail -20

echo "=== auth 10gbs->panel ==="
node scripts/test-auth-10gbs-to-panel.cjs 2>&1 | tail -15

echo "=== playback verify ==="
bash scripts/quick-playback-verify-45.sh 2>&1 | tail -20
