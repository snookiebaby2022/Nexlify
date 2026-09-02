#!/bin/bash
set -euo pipefail
cd /home/nexlify-panel
grep -n 'Leftover XUI redirectStream' src/lib/stream-playback-policy.ts
: > /tmp/nexlify-publish-live-label.log
nohup bash scripts/publish-panel-release.sh > /tmp/nexlify-publish-live-label.log 2>&1 </dev/null &
echo PUBLISH_PID:$!
sleep 1
head -10 /tmp/nexlify-publish-live-label.log || true
