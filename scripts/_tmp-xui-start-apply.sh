#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
cp /tmp/nexlify-migrate-apply.json /tmp/nexlify-migrate-job.json
nohup node --import tsx scripts/panel-migrate-background.ts /tmp/nexlify-migrate-job.json > /tmp/xui-apply.log 2>&1 &
echo $! > /tmp/xui-apply.pid
echo STARTED $(cat /tmp/xui-apply.pid)
