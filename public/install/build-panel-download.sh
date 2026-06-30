#!/usr/bin/env bash
# Build nexlify-panel.tar.gz for https://nexlify.live/downloads/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/nexlify-panel.tar.gz}"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

tar -czf "$OUT" \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.git \
  --exclude=./data \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=.env.production \
  --exclude=.env.development \
  --exclude=dist \
  -C "$ROOT" .

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"

TAR_LIST="$(tar -tzf "$OUT")"
missing=""
for f in .env.example src/lib/panel-releases.json src/lib/lines.ts scripts/set-admin-password.cjs scripts/load-env.cjs scripts/panel-port-config.sh scripts/sync-license-env.mjs scripts/ensure-panel-env.sh scripts/fix-panel-ip-login.sh scripts/verify-install-smoke.sh scripts/verify-install-login.sh scripts/verify-panel-admin-login.cjs scripts/reset-panel-admin.sh scripts/apply-panel-fast-update.sh scripts/panel-restart-safe.sh nginx/nexlify-stream-edge.conf scripts/nexlify-port-registry.sh scripts/nexlify-firewall-ports.sh scripts/sync-panel-ports.sh scripts/install-nginx-stream-edge.sh scripts/install-nginx-rtmp.sh scripts/install-nginx-https-extra-ports.sh scripts/install-monolithic-profile.sh scripts/install-local-stream-agent.sh scripts/ensure-monolithic-server.ts scripts/fix-stream-edge-now.sh scripts/verify-panel-ports.sh scripts/installer-finalize-ports.sh; do
  if ! echo "$TAR_LIST" | grep -qE "(^|/)${f}$"; then
    missing="${missing}\n  - ${f}"
  fi
done
if [ -n "$missing" ]; then
  echo "WARN: tarball verify (continuing):${missing}" >&2
else
  echo "Tarball verify OK"
fi
