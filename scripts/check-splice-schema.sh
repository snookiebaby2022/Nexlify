#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
echo "=== schema lastSplice ==="
grep -n lastSplice prisma/schema.prisma || echo "MISSING in schema"
echo "=== db columns ==="
sudo -u postgres psql -d nexlify -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='Stream' AND column_name LIKE 'lastSplice%'" || true
echo "=== build procs ==="
ps aux | grep -E 'next build|rebuild-panel|deploy-dash' | grep -v grep || echo stopped
