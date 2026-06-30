#!/usr/bin/env bash
# Publish panel tarball + installer scripts to nexlify.live (run on vendor VPS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building panel tarball (isolated staging copy)..."
STAGE="$(mktemp -d /tmp/nexlify-publish-XXXXXX)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude=node_modules --exclude=.next --exclude=.git \
    --exclude=data --exclude=dist --exclude='.env*' \
    "$ROOT/" "$STAGE/"
else
  cp -a "$ROOT" "$STAGE/src-root" 2>/dev/null || cp -a "$ROOT/." "$STAGE/"
fi

cd "$STAGE"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
node scripts/fix-sh-lf.mjs 2>/dev/null || true
npm run package:panel
TAR="$STAGE/dist/nexlify-panel.tar.gz"
[ -f "$TAR" ] || { echo "Missing $TAR" >&2; exit 1; }

DEST="${PANEL_PUBLISH_DEST:-/var/www/nexlify/public/downloads/nexlify-panel.tar.gz}"
INSTALL_DEST="${PANEL_INSTALL_DEST:-/var/www/nexlify/public/install}"

mkdir -p "$(dirname "$DEST")" "$INSTALL_DEST" "$INSTALL_DEST/scripts"
cp -f "$TAR" "$DEST"
cp -f "$ROOT/scripts/install-linux.sh" "$INSTALL_DEST/panel.sh"
cp -f "$ROOT/scripts/fix-panel-auto-update.sh" "$INSTALL_DEST/fix-panel-auto-update.sh"
cp -f "$ROOT/scripts/fix-panel-restart.sh" "$INSTALL_DEST/fix-panel-restart.sh"
cp -f "$ROOT/scripts/fix-stream-edge-now.sh" "$INSTALL_DEST/fix-stream-edge-now.sh"
cp -f "$ROOT/scripts/panel-restart-safe.sh" "$INSTALL_DEST/scripts/panel-restart-safe.sh"
cp -f "$ROOT/scripts/panel-update-recover.sh" "$INSTALL_DEST/scripts/panel-update-recover.sh"
cp -f "$ROOT/scripts/install-mediamtx-webrtc.sh" "$INSTALL_DEST/scripts/install-mediamtx-webrtc.sh"
cp -f "$ROOT/scripts/apply-panel-fast-update.sh" "$INSTALL_DEST/apply-panel-fast-update.sh"
cp -f "$ROOT/scripts/installer-finalize-ports.sh" "$INSTALL_DEST/scripts/installer-finalize-ports.sh"
cp -f "$ROOT/scripts/sync-panel-ports.sh" "$INSTALL_DEST/scripts/sync-panel-ports.sh"
cp -f "$ROOT/scripts/nexlify-firewall-ports.sh" "$INSTALL_DEST/scripts/nexlify-firewall-ports.sh"
cp -f "$ROOT/scripts/nexlify-port-registry.sh" "$INSTALL_DEST/scripts/nexlify-port-registry.sh"
cp -f "$ROOT/scripts/install-nginx-stream-edge.sh" "$INSTALL_DEST/scripts/install-nginx-stream-edge.sh"
cp -f "$ROOT/scripts/install-nginx-rtmp.sh" "$INSTALL_DEST/scripts/install-nginx-rtmp.sh"
cp -f "$ROOT/scripts/install-nginx-https-extra-ports.sh" "$INSTALL_DEST/scripts/install-nginx-https-extra-ports.sh"
cp -f "$ROOT/scripts/install-monolithic-profile.sh" "$INSTALL_DEST/scripts/install-monolithic-profile.sh"
cp -f "$ROOT/scripts/install-local-stream-agent.sh" "$INSTALL_DEST/scripts/install-local-stream-agent.sh"
cp -f "$ROOT/scripts/fix-stream-edge-now.sh" "$INSTALL_DEST/scripts/fix-stream-edge-now.sh"
cp -f "$ROOT/scripts/verify-panel-ports.sh" "$INSTALL_DEST/scripts/verify-panel-ports.sh"
cp -f "$ROOT/scripts/has-valid-next-build.sh" "$INSTALL_DEST/scripts/has-valid-next-build.sh"
PANEL_VER="$(node -p "require('$ROOT/package.json').version.replace(/\\./g,'')")"
sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[0-9a-zA-Z]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
  "$INSTALL_DEST/apply-panel-fast-update.sh" 2>/dev/null || true
sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[0-9a-zA-Z]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
  "$INSTALL_DEST/panel.sh" 2>/dev/null || true
sed -i 's/\r$//' "$INSTALL_DEST"/*.sh "$INSTALL_DEST"/scripts/*.sh 2>/dev/null || true
chmod +x "$INSTALL_DEST"/*.sh "$INSTALL_DEST"/scripts/*.sh 2>/dev/null || true

echo "Published:"
echo "  $DEST ($(du -h "$DEST" | cut -f1))"
echo "  $INSTALL_DEST/panel.sh (one-click installer v${PANEL_VER})"
echo "  $INSTALL_DEST/apply-panel-fast-update.sh"
echo "  $INSTALL_DEST/fix-stream-edge-now.sh"
echo "  port scripts → $INSTALL_DEST/scripts/"
echo "Release feed: sync panel-releases.json to marketing and redeploy nexlify-web."
