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
  --exclude=.next.backup \
  --exclude=.next.old \
  --exclude=.next.staging \
  --exclude=.next.zip \
  --exclude=.git \
  --exclude=./data \
  --exclude=.env \
  --exclude=.env.local \
  --exclude=.env.production \
  --exclude=.env.development \
  --exclude=.env.broken-install-* \
  --exclude=dist \
  --exclude=marketing-drop-in \
  --exclude=windows \
  --exclude=.claude \
  --exclude=.cursor \
  --exclude=.agents \
  --exclude=graft \
  --exclude=.next.test \
  --exclude=backups \
  --exclude=docs \
  -C "$ROOT" .

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
TAR_BYTES="$(wc -c < "$OUT" | tr -d '[:space:]')"
# Source tarball should be a few MB (no node_modules / .next*). ~3MB typical; fail if bloated.
if [ "${TAR_BYTES:-0}" -gt 40000000 ]; then
  echo "ERROR: tarball too large (${TAR_BYTES} bytes) — likely includes .next.backup or similar. Check excludes." >&2
  exit 1
fi
if [ "${TAR_BYTES:-0}" -lt 500000 ]; then
  echo "ERROR: tarball too small (${TAR_BYTES} bytes)" >&2
  exit 1
fi

missing=""
for f in .env.example src/lib/panel-releases.json src/lib/lines.ts scripts/set-admin-password.cjs scripts/load-env.cjs scripts/panel-port-config.sh scripts/sync-license-env.mjs scripts/ensure-panel-env.sh scripts/tune-streaming-host.sh scripts/prune-stale-live-connections.sh scripts/fix-panel-ip-login.sh scripts/verify-install-smoke.sh scripts/verify-install-login.sh scripts/verify-panel-admin-login.cjs scripts/reset-panel-admin.sh scripts/apply-panel-fast-update.sh scripts/apply-prebuilt-update.sh scripts/panel-restart-safe.sh scripts/rematch-iptv-edge-auth.sh scripts/sync-internal-secret-env.sh scripts/panel-update-background.sh scripts/panel-update-background.ts scripts/fix-update-worker-now.sh nginx/nexlify-stream-edge.conf scripts/nexlify-port-registry.sh scripts/nexlify-firewall-ports.sh scripts/nexlify-nginx-release-ports.sh scripts/sync-panel-ports.sh scripts/install-nginx-stream-edge.sh scripts/install-iptv-edge-proxy.sh scripts/iptv-edge-proxy.mjs scripts/install-nginx-rtmp.sh scripts/install-nginx-https-extra-ports.sh scripts/install-monolithic-profile.sh scripts/install-local-stream-agent.sh scripts/ensure-monolithic-server.ts scripts/fix-stream-edge-now.sh scripts/verify-panel-ports.sh scripts/installer-finalize-ports.sh; do
  if ! grep -qF "$f" < <(tar -tzf "$OUT"); then
    missing="${missing}\n  - ${f}"
  fi
done
if [ -n "$missing" ]; then
  echo "ERROR: tarball missing required files:${missing}" >&2
  exit 1
fi
echo "Tarball verify OK"
