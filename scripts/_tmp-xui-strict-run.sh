#!/bin/bash
set -euo pipefail
cd /opt/nexlify-panel
sed -i 's/\r$//' /opt/nexlify-panel/scripts/xui-strict-match-catalog.ts 2>/dev/null || true
exec node --import tsx scripts/xui-strict-match-catalog.ts /tmp/xui-catalog-only.sql "$@"
