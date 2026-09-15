#!/usr/bin/env bash
# Apply hardening migration + reload nginx templates on the panel host.
# Run on server 45 (or any panel VPS) from /opt/nexlify-panel:
#   bash scripts/apply-hardening-ops.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== prisma migrate =="
npx prisma migrate deploy

echo "== live-routing drift (repo) =="
bash scripts/check-live-routing-drift.sh || true

if [ -f /etc/nginx/nginx.conf ]; then
  echo "== nginx -t =="
  nginx -t
  echo "== reload nginx =="
  systemctl reload nginx || service nginx reload || true
fi

if command -v pm2 >/dev/null 2>&1; then
  echo "== pm2 restart panel (if named nexlify*) =="
  pm2 restart nexlify --update-env 2>/dev/null || pm2 restart all --update-env 2>/dev/null || true
fi

echo "HINT: set REDIS_SLOTS_URL for a dedicated noeviction Redis if cache Redis uses allkeys-lru"
echo "HINT: on 10gbs edge, copy scripts/iptv-edge-proxy.mjs + edge-redis-slots.mjs and pm2 restart edge"
echo "APPLY_HARDENING_OPS_DONE"
