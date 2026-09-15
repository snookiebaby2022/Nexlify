#!/usr/bin/env bash
set -euo pipefail
BASE=/tmp/nexlify-dash-fix
ROOT=/opt/nexlify-panel
cp "$BASE/dashboard-server-metrics.ts" "$ROOT/src/lib/dashboard-server-metrics.ts"
cp "$BASE/dashboard-stats.ts" "$ROOT/src/lib/dashboard-stats.ts"
cp "$BASE/perf-polling.ts" "$ROOT/src/lib/perf-polling.ts"
cp "$BASE/route.ts" "$ROOT/src/app/api/admin/dashboard-stream/route.ts"
cp "$BASE/dashboard-xui-kpi-ribbon.tsx" "$ROOT/src/components/dashboard-xui-kpi-ribbon.tsx"
cp "$BASE/panel-dashboard.tsx" "$ROOT/src/components/panel-dashboard.tsx"
echo "files copied"
