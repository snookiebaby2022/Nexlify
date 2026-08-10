#!/usr/bin/env bash
# Copy canonical panel installer scripts → marketing-drop-in/public/install/
# Run from repo root: bash scripts/sync-install-to-marketing.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL="$ROOT/marketing-drop-in/public/install"
SCRIPTS="$ROOT/scripts"

mkdir -p "$INSTALL" "$INSTALL/scripts"

cp -f "$SCRIPTS/install-linux.sh" "$INSTALL/panel.sh"
cp -f "$SCRIPTS/install-linux.sh" "$ROOT/marketing-drop-in/scripts/install-linux.sh"
cp -f "$SCRIPTS/fix-panel-auto-update.sh" "$INSTALL/"
cp -f "$SCRIPTS/fix-panel-restart.sh" "$INSTALL/"
cp -f "$SCRIPTS/fix-panel-license-sync.sh" "$INSTALL/"
cp -f "$SCRIPTS/fix-stream-edge-now.sh" "$INSTALL/"
cp -f "$SCRIPTS/apply-panel-fast-update.sh" "$INSTALL/"
cp -f "$SCRIPTS/panel-restart-safe.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/panel-update-recover.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/panel-update-background.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/panel-update-background.ts" "$INSTALL/scripts/"
cp -f "$SCRIPTS/fix-update-worker-now.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/fix-all-customer-updates.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/fix-tarball-publish-now.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/install-mediamtx-webrtc.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/installer-finalize-ports.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/sync-panel-ports.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/nexlify-firewall-ports.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/nexlify-port-registry.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/install-nginx-stream-edge.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/install-nginx-rtmp.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/install-nginx-https-extra-ports.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/install-monolithic-profile.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/install-local-stream-agent.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/fix-stream-edge-now.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/verify-panel-ports.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/has-valid-next-build.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/fix-panel-ip-login.sh" "$INSTALL/scripts/fix-ip-login.sh"
cp -f "$SCRIPTS/load-env.cjs" "$INSTALL/scripts/"
cp -f "$SCRIPTS/panel-port-config.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/set-admin-password.cjs" "$INSTALL/scripts/"
cp -f "$SCRIPTS/verify-install-smoke.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/verify-install-login.sh" "$INSTALL/scripts/"
cp -f "$SCRIPTS/verify-panel-admin-login.cjs" "$INSTALL/scripts/"
cp -f "$SCRIPTS/reset-panel-admin.sh" "$INSTALL/scripts/"

# Version helper (used when installer scripts run from panel repo)
cp -f "$SCRIPTS/panel-version.sh" "$INSTALL/scripts/"

# VPS repair scripts (no git on server — served from /install/)
cp -f "$SCRIPTS/vps-init-panel-git.sh" "$INSTALL/"
cp -f "$SCRIPTS/vps-publish-panel-release.sh" "$INSTALL/"
cp -f "$SCRIPTS/vps-fix-everything.sh" "$INSTALL/"
cp -f "$SCRIPTS/vps-git-auth.sh" "$INSTALL/"
cp -f "$ROOT/marketing-drop-in/scripts/vps-fix-installer.sh" "$INSTALL/"
cp -f "$ROOT/marketing-drop-in/scripts/vps-patch-panel-installer.sh" "$INSTALL/"
chmod +x "$INSTALL/vps-emergency-fix.sh" "$INSTALL/vps-fix-installer.sh" "$INSTALL/vps-patch-panel-installer.sh" \
  "$INSTALL/vps-init-panel-git.sh" "$INSTALL/vps-publish-panel-release.sh" "$INSTALL/vps-fix-everything.sh" "$INSTALL/vps-git-auth.sh" 2>/dev/null || true

PANEL_VER="$(node -p "require('$ROOT/package.json').version")"
cp -f "$ROOT/src/lib/panel-releases.json" "$ROOT/marketing-drop-in/public/panel-releases.json"
sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[^\"]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
  "$INSTALL/apply-panel-fast-update.sh" "$INSTALL/panel.sh" 2>/dev/null || true

# Keep installer script docs in sync with panel semver (1.9.7 → ?v=1.9.7)
sed -i "s|panel\.sh?v=[0-9.a-zA-Z]*|panel.sh?v=${PANEL_VER}|g" "$SCRIPTS/install-linux.sh" "$INSTALL/panel.sh" 2>/dev/null || true

# Runtime install command JSON (uploadable without rebuild)
cat > "$ROOT/marketing-drop-in/public/install-command.json" << EOF
{
  "version": "${PANEL_VER}",
  "label": "v${PANEL_VER}",
  "url": "https://nexlify.live/install/panel.sh?v=${PANEL_VER}",
  "command": "curl -fsSL 'https://nexlify.live/install/panel.sh?v=${PANEL_VER}' | sudo bash"
}
EOF

sed -i 's/\r$//' "$INSTALL"/*.sh "$INSTALL"/scripts/*.sh 2>/dev/null || true
chmod +x "$INSTALL"/*.sh "$INSTALL"/scripts/*.sh 2>/dev/null || true

echo "Synced installer scripts → $INSTALL (panel v${PANEL_VER})"
