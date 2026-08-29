#!/usr/bin/env bash
# Run live URL dedupe on the server (survives SSH drop). Logs: /var/log/nexlify-purge-live-dup.log
set -euo pipefail
cd /opt/nexlify-panel
LOG=/var/log/nexlify-purge-live-dup.log
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) wrapper start" >> "$LOG"
node scripts/purge-live-url-duplicates-sql.cjs
node scripts/invalidate-playback-cache.cjs >> "$LOG" 2>&1 || true
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) wrapper done" >> "$LOG"
