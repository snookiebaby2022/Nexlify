#!/usr/bin/env bash
# Deploy dashboard bandwidth fix without git reset wiping local patches.
set -euo pipefail
SRC=/tmp/nexlify-dash-fix
ROOT=/opt/nexlify-panel
mkdir -p "$SRC"
cp -v "$SRC/dashboard-server-metrics.ts" "$ROOT/src/lib/dashboard-server-metrics.ts"
cp -v "$SRC/dashboard-stats.ts" "$ROOT/src/lib/dashboard-stats.ts"
cp -v "$SRC/perf-polling.ts" "$ROOT/src/lib/perf-polling.ts"
cp -v "$SRC/route.ts" "$ROOT/src/app/api/admin/dashboard-stream/route.ts"
cp -v "$SRC/dashboard-xui-kpi-ribbon.tsx" "$ROOT/src/components/dashboard-xui-kpi-ribbon.tsx"
cp -v "$SRC/panel-dashboard.tsx" "$ROOT/src/components/panel-dashboard.tsx"
cp -v "$SRC/use-dashboard-stream.ts" "$ROOT/src/hooks/use-dashboard-stream.ts"
cp -v "$SRC/credential-generate.ts" "$ROOT/src/lib/credential-generate.ts"
# Keep media origin through rebuild
MEDIA_ORIGIN="$(grep -E '^NEXLIFY_MEDIA_ORIGIN=' "$ROOT/.env" 2>/dev/null | head -1 || true)"
cd "$ROOT"
export NEXLIFY_FORCE_BUILD=1 NEXLIFY_ALLOW_PROTECTED_45=1 NEXLIFY_SKIP_GIT_RESET=1
bash scripts/rebuild-panel-safe.sh
# Restore media origin into standalone env if wiped
if [ -n "$MEDIA_ORIGIN" ]; then
  for f in "$ROOT/.env" "$ROOT/.next/standalone/.env"; do
    [ -f "$f" ] || continue
    if grep -q '^NEXLIFY_MEDIA_ORIGIN=' "$f"; then
      sed -i "s|^NEXLIFY_MEDIA_ORIGIN=.*|$MEDIA_ORIGIN|" "$f"
    else
      echo "$MEDIA_ORIGIN" >> "$f"
    fi
  done
  pm2 restart nexlify --update-env || true
fi
echo "=== verify strings in build ==="
grep -rl 'panelProxyMbps\|lbCapMbps' "$ROOT/.next/standalone/.next/server" 2>/dev/null | head -3 || echo "WARN: panelProxyMbps not found in server build"
grep -rl 'LB egress' "$ROOT/.next/standalone/.next/static" 2>/dev/null | head -3 || echo "WARN: LB egress not found in client build"
curl -sS -m 8 http://127.0.0.1:13000/api/health || true
echo
grep NEXLIFY_MEDIA_ORIGIN "$ROOT/.next/standalone/.env" || true
