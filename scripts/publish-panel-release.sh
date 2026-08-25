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
    --exclude=node_modules --exclude=.next --exclude='.next.*' --exclude=.git \
    --exclude=data --exclude=dist \
    --exclude=marketing-drop-in --exclude=windows --exclude=.claude --exclude=.cursor \
    --exclude=.agents --exclude=graft \
    --exclude='.env' --exclude='.env.local' --exclude='.env.production' \
    --exclude='.env.development' --exclude='.env.backup.*' --exclude='.env.broken-install-*' \
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
RELEASES_JSON="${PANEL_RELEASES_PUBLIC:-/var/www/nexlify/public/panel-releases.json}"

mkdir -p "$(dirname "$DEST")" "$INSTALL_DEST" "$INSTALL_DEST/scripts" "$(dirname "$RELEASES_JSON")"
cp -f "$TAR" "$DEST"
cp -f "$ROOT/src/lib/panel-releases.json" "$RELEASES_JSON"
chmod 644 "$DEST" "$RELEASES_JSON"
TAR_SIZE="$(wc -c < "$DEST" | tr -d '[:space:]')"
if [ -z "$TAR_SIZE" ] || [ "$TAR_SIZE" -lt 500000 ]; then
  echo "ERROR: tarball too small after build (${TAR_SIZE:-0} bytes)" >&2
  exit 1
fi

PANEL_VER="$(node -p "require('$ROOT/package.json').version")"

installer_script_ok() {
  local f="$1"
  [ -f "$f" ] || return 1
  grep -q 'detect_server_address' "$f" 2>/dev/null || return 1
  ! grep -qE 'FATAL.*domain|--domain is required' "$f" 2>/dev/null
}

pick_installer_script() {
  local candidate
  # Prefer repo scripts/install-linux.sh (source of truth). Stale
  # marketing-drop-in/public/install/panel.sh must not win publish.
  for candidate in \
    "$ROOT/scripts/install-linux.sh" \
    "$ROOT/marketing-drop-in/public/install/panel.sh"; do
    if installer_script_ok "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if [ "${SKIP_INSTALL_SCRIPT_PUBLISH:-0}" = "1" ]; then
  echo "Skipping installer script publish (marketing bundle owns /public/install — set SKIP_INSTALL_SCRIPT_PUBLISH=0 to override)"
else
INSTALLER_SRC="$(pick_installer_script || true)"
if [ -z "$INSTALLER_SRC" ]; then
  echo "WARN: No installer with auto-detect IP found — keeping existing $INSTALL_DEST/panel.sh" >&2
  echo "      Run: bash marketing-drop-in/scripts/vps-fix-installer.sh" >&2
else
cp -f "$INSTALLER_SRC" "$INSTALL_DEST/panel.sh"
cp -f "$ROOT/scripts/fix-panel-auto-update.sh" "$INSTALL_DEST/fix-panel-auto-update.sh"
cp -f "$ROOT/scripts/fix-panel-restart.sh" "$INSTALL_DEST/fix-panel-restart.sh"
cp -f "$ROOT/scripts/fix-stream-edge-now.sh" "$INSTALL_DEST/fix-stream-edge-now.sh"
cp -f "$ROOT/scripts/panel-restart-safe.sh" "$INSTALL_DEST/scripts/panel-restart-safe.sh"
cp -f "$ROOT/scripts/panel-update-recover.sh" "$INSTALL_DEST/scripts/panel-update-recover.sh"
cp -f "$ROOT/scripts/panel-update-background.sh" "$INSTALL_DEST/scripts/panel-update-background.sh"
cp -f "$ROOT/scripts/panel-update-background.ts" "$INSTALL_DEST/scripts/panel-update-background.ts"
cp -f "$ROOT/scripts/fix-all-customer-updates.sh" "$INSTALL_DEST/scripts/fix-all-customer-updates.sh"
cp -f "$ROOT/scripts/fix-stuck-customer-panel.sh" "$INSTALL_DEST/scripts/fix-stuck-customer-panel.sh"
cp -f "$ROOT/scripts/fix-customer-panel.sh" "$INSTALL_DEST/scripts/fix-customer-panel.sh"
cp -f "$ROOT/scripts/fix-customer-panel.sh" "$INSTALL_DEST/fix-customer-panel.sh"
cp -f "$ROOT/scripts/fix-panel-down-now.sh" "$INSTALL_DEST/scripts/fix-panel-down-now.sh"
cp -f "$ROOT/scripts/fix-panel-down-now.sh" "$INSTALL_DEST/fix-panel-down-now.sh"
cp -f "$ROOT/scripts/ensure-customer-ip-env.sh" "$INSTALL_DEST/scripts/ensure-customer-ip-env.sh"
cp -f "$ROOT/scripts/fix-panel-ip-login.sh" "$INSTALL_DEST/fix-ip-login.sh"
cp -f "$ROOT/scripts/fix-panel-ip-login.sh" "$INSTALL_DEST/scripts/fix-panel-ip-login.sh"
cp -f "$ROOT/scripts/vps-fix-everything.sh" "$INSTALL_DEST/vps-fix-everything.sh"
cp -f "$ROOT/scripts/vps-publish-panel-release.sh" "$INSTALL_DEST/vps-publish-panel-release.sh"
cp -f "$ROOT/scripts/install-mediamtx-webrtc.sh" "$INSTALL_DEST/scripts/install-mediamtx-webrtc.sh"
cp -f "$ROOT/scripts/apply-panel-fast-update.sh" "$INSTALL_DEST/apply-panel-fast-update.sh"
cp -f "$ROOT/scripts/installer-finalize-ports.sh" "$INSTALL_DEST/scripts/installer-finalize-ports.sh"
cp -f "$ROOT/scripts/sync-panel-ports.sh" "$INSTALL_DEST/scripts/sync-panel-ports.sh"
cp -f "$ROOT/scripts/nexlify-firewall-ports.sh" "$INSTALL_DEST/scripts/nexlify-firewall-ports.sh"
cp -f "$ROOT/scripts/nexlify-port-registry.sh" "$INSTALL_DEST/scripts/nexlify-port-registry.sh"
cp -f "$ROOT/scripts/nexlify-nginx-release-ports.sh" "$INSTALL_DEST/scripts/nexlify-nginx-release-ports.sh"
cp -f "$ROOT/scripts/install-nginx-stream-edge.sh" "$INSTALL_DEST/scripts/install-nginx-stream-edge.sh"
cp -f "$ROOT/scripts/install-iptv-edge-proxy.sh" "$INSTALL_DEST/scripts/install-iptv-edge-proxy.sh"
cp -f "$ROOT/scripts/iptv-edge-proxy.mjs" "$INSTALL_DEST/scripts/iptv-edge-proxy.mjs"
cp -f "$ROOT/scripts/ensure-panel-env.sh" "$INSTALL_DEST/scripts/ensure-panel-env.sh"
cp -f "$ROOT/scripts/pm2-start.sh" "$INSTALL_DEST/scripts/pm2-start.sh"
cp -f "$ROOT/scripts/install-nginx-rtmp.sh" "$INSTALL_DEST/scripts/install-nginx-rtmp.sh"
cp -f "$ROOT/scripts/install-nginx-https-extra-ports.sh" "$INSTALL_DEST/scripts/install-nginx-https-extra-ports.sh"
cp -f "$ROOT/scripts/install-monolithic-profile.sh" "$INSTALL_DEST/scripts/install-monolithic-profile.sh"
cp -f "$ROOT/scripts/install-local-stream-agent.sh" "$INSTALL_DEST/scripts/install-local-stream-agent.sh"
cp -f "$ROOT/scripts/fix-stream-edge-now.sh" "$INSTALL_DEST/scripts/fix-stream-edge-now.sh"
cp -f "$ROOT/scripts/verify-panel-ports.sh" "$INSTALL_DEST/scripts/verify-panel-ports.sh"
cp -f "$ROOT/scripts/has-valid-next-build.sh" "$INSTALL_DEST/scripts/has-valid-next-build.sh"
sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[^\"]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
  "$INSTALL_DEST/apply-panel-fast-update.sh" 2>/dev/null || true
sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[^\"]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
  "$INSTALL_DEST/panel.sh" 2>/dev/null || true
sed -i 's/\r$//' "$INSTALL_DEST"/*.sh "$INSTALL_DEST"/scripts/*.sh 2>/dev/null || true
chmod +x "$INSTALL_DEST"/*.sh "$INSTALL_DEST"/scripts/*.sh 2>/dev/null || true
echo "  installer source: $INSTALLER_SRC"
fi
fi

echo "Published:"
echo "  $DEST ($(du -h "$DEST" | cut -f1))"
if [ "${SKIP_INSTALL_SCRIPT_PUBLISH:-0}" != "1" ]; then
echo "  $INSTALL_DEST/panel.sh (one-click installer v${PANEL_VER})"
echo "  $INSTALL_DEST/apply-panel-fast-update.sh"
echo "  $INSTALL_DEST/fix-stream-edge-now.sh"
echo "  port scripts → $INSTALL_DEST/scripts/"
fi

# Always refresh static install-command.json so the marketing UI never shows a stale ?v=
MARKETING_ROOT="$(dirname "$(dirname "$DEST")")"
if [ -d "$MARKETING_ROOT" ]; then
  cat > "$MARKETING_ROOT/install-command.json" << EOF
{
  "version": "${PANEL_VER}",
  "label": "v${PANEL_VER}",
  "url": "https://nexlify.live/install/panel.sh?v=${PANEL_VER}",
  "command": "curl -fsSL 'https://nexlify.live/install/panel.sh?v=${PANEL_VER}' | sudo bash"
}
EOF
  echo "  $MARKETING_ROOT/install-command.json → v${PANEL_VER}"
fi
echo "Release feed: sync panel-releases.json to marketing and redeploy nexlify-web."
