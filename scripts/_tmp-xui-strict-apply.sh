#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
sed -i 's/\r$//' scripts/xui-strict-match-catalog.ts
nohup node --import tsx scripts/xui-strict-match-catalog.ts /tmp/xui-catalog-only.sql --apply > /tmp/xui-strict-apply.log 2>&1 &
echo $! > /tmp/xui-strict-apply.pid
echo STARTED $(cat /tmp/xui-strict-apply.pid)
