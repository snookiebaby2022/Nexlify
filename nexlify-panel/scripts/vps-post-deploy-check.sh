#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== disk ==="
df -h /home/nexlify-panel || df -h .
echo "=== issue + test ==="
node scripts/issue-and-test-license.mjs
