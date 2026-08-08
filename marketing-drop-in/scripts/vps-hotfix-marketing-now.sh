#!/usr/bin/env bash
# One-shot fix: marketing install URL (?v=1.9.7) + panel.sh auto-detect.
# Run on vendor VPS as root:
#   bash /root/vps-hotfix-marketing-now.sh
#
# Or paste this entire file to /root/vps-hotfix-marketing-now.sh and run it.
set -euo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PORT="${MARKETING_PORT:-13001}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
VER="$(node -p "require('$MARKETING/package.json').version" 2>/dev/null || echo 1.9.7)"

echo "=== Nexlify marketing hotfix (install URL + panel.sh) ==="
echo "Target: $MARKETING  version: $VER"
echo ""

cd "$MARKETING"

# --- 1) Fix panel-install.ts source ---
PI="$MARKETING/src/lib/panel-install.ts"
mkdir -p "$(dirname "$PI")"
cat > "$PI" << 'PANELINSTALLEOF'
/** Shared copy for /install — keep installer docs in sync with scripts/install-linux.sh */

import panelReleases from "./panel-releases.json";

export const PANEL_INSTALL_DIR = "/opt/nexlify-panel";
export const CREDENTIALS_ROOT_DIR = "/root/nexlify";
export const CREDENTIALS_FILE = `${CREDENTIALS_ROOT_DIR}/install-credentials`;

export const PANEL_VERSION = panelReleases.latestVersion;
export const INSTALLER_VERSION = `v${PANEL_VERSION}`;
export const INSTALLER_CACHE_QUERY = `v=${PANEL_VERSION}`;
export const installerPanelShUrl = `https://nexlify.live/install/panel.sh?${INSTALLER_CACHE_QUERY}`;

export const cleanReinstallCommand = `sudo rm -rf ${PANEL_INSTALL_DIR}`;
export const simpleInstallCommand = `curl -fsSL '${installerPanelShUrl}' | sudo bash`;

export function buildOneClickInstallCommand(opts?: {
  ip?: string;
  license?: string;
}): string {
  const base = `curl -fsSL '${installerPanelShUrl}' | sudo bash`;
  const flags: string[] = [];
  if (opts?.ip?.trim()) flags.push(`--ip ${opts.ip.trim()}`);
  if (opts?.license?.trim()) flags.push(`--license ${opts.license.trim()}`);
  if (flags.length === 0) return base;
  return `${base} -s -- ${flags.join(" ")}`;
}

export const oneClickInstallExample = buildOneClickInstallCommand();
export const cleanReinstallWithFreshFlag = `curl -fsSL '${installerPanelShUrl}' | sudo bash -s -- --fresh`;
export const wgetInstallExample = `wget -qO- '${installerPanelShUrl}' | sudo bash`;

export const credentialsHelp = {
  file: CREDENTIALS_FILE,
  rootDir: CREDENTIALS_ROOT_DIR,
  rootFile: CREDENTIALS_FILE,
  viewCommand: `cat ${CREDENTIALS_FILE}`,
  fields: [
    { key: "login_url", label: "Open in browser — printed at end of install (port 80)" },
    { key: "iptv_url", label: "IPTV / Smarters HTTP edge (line username + password)" },
    { key: "stream_http_port", label: "Stream edge port (80 for IP install)" },
    { key: "admin_user / admin_password", label: "Sign in — then add license in the panel" },
    { key: "domain", label: "Auto-detected server IP or hostname" },
    { key: "postgres_user / postgres_password", label: "PostgreSQL (database)" },
  ],
};
PANELINSTALLEOF
echo "-> Wrote $PI"

# --- 2) Fix panel.sh (installer script nginx serves directly) ---
PANEL_SH="$MARKETING/public/install/panel.sh"
mkdir -p "$(dirname "$PANEL_SH")"
for SRC in \
  "$MARKETING/scripts/install-linux.sh" \
  "$PANEL/scripts/install-linux.sh" \
  "/root/panel.sh.new"; do
  if [ -f "$SRC" ] && grep -q 'detect_server_address' "$SRC" 2>/dev/null; then
    cp -f "$SRC" "$PANEL_SH"
    echo "-> panel.sh from $SRC"
    break
  fi
done
if ! grep -q 'detect_server_address' "$PANEL_SH" 2>/dev/null; then
  echo "-> panel.sh: running in-place patch"
  bash "$MARKETING/scripts/vps-patch-panel-installer.sh" "$PANEL_SH" 2>/dev/null || \
  bash /root/vps-patch-panel-installer.sh "$PANEL_SH" 2>/dev/null || true
fi
chmod +x "$PANEL_SH" 2>/dev/null || true

# --- 3) Instant patch old .next build (works before rebuild completes) ---
if [ -d "$MARKETING/.next" ]; then
  echo "-> Patching cached .next bundles (v1.9.7 -> v=1.9.7)"
  find "$MARKETING/.next" -type f -name '*.js' 2>/dev/null | while read -r f; do
    if grep -q 'panel.sh?v1.9.7\|panel.sh?v'"$VER" "$f" 2>/dev/null; then
      sed -i "s|panel.sh?v${VER}|panel.sh?v=${VER}|g; s|panel.sh?v1.9.7|panel.sh?v=1.9.7|g" "$f"
    fi
  done
fi

# --- 4) Rebuild marketing ---
echo "-> Rebuilding marketing (2-5 min)..."
export NEXT_TELEMETRY_DISABLED=1
# shellcheck disable=SC1091
[ -f "$MARKETING/scripts/load-marketing-env.sh" ] && source "$MARKETING/scripts/load-marketing-env.sh" || true
npx prisma generate >/dev/null 2>&1 || true
npm run build 2>&1 | tail -8

if [ ! -f "$MARKETING/.next/BUILD_ID" ]; then
  echo "ERROR: build failed — check output above"
  exit 1
fi

# --- 5) Restart ---
echo "-> Restarting PM2..."
pm2 restart nexlify-web --update-env 2>&1 | tail -3
pm2 save 2>/dev/null || true
sleep 4

# --- 6) Verify ---
echo ""
echo "=== Verification ==="
HTML="$(curl -fsS "http://127.0.0.1:${PORT}/install" 2>/dev/null || true)"
if echo "$HTML" | grep -q 'panel.sh?v=1.9.7\|panel.sh?v='"$VER"; then
  echo "OK: /install page shows ?v=${VER}"
elif echo "$HTML" | grep -q 'panel.sh?v1.9.7\|panel.sh?v'"$VER"; then
  echo "FAIL: /install still shows wrong URL (v${VER} without =)"
  echo "$HTML" | grep -o 'panel.sh[^"'\'']*' | head -3
  exit 1
else
  echo "WARN: could not grep install URL from HTML — check manually"
fi

if grep -q 'detect_server_address' "$PANEL_SH" 2>/dev/null; then
  echo "OK: panel.sh has auto-detect IP"
else
  echo "FAIL: panel.sh still old — upload marketing-drop-in/public/install/panel.sh via WinSCP"
  exit 1
fi

echo ""
echo "=== DONE ==="
echo "Install command: curl -fsSL 'https://nexlify.live/install/panel.sh?v=${VER}' | sudo bash"
echo "Hard-refresh: https://nexlify.live/install (Ctrl+Shift+R)"
