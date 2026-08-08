#!/usr/bin/env bash
# Repair failed marketing build after partial panel-install.ts sed patch.
# Run on VPS as root: bash /var/www/nexlify/scripts/vps-repair-install-build.sh
set -euo pipefail

MARKETING="${1:-/var/www/nexlify}"
cd "$MARKETING"

echo "=== Repair marketing install page build ==="

cat > "$MARKETING/src/lib/panel-install.ts" << 'EOF'
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
EOF

VER="$(node -p "require('./src/lib/panel-releases.json').latestVersion" 2>/dev/null || echo 1.9.7)"
mkdir -p "$MARKETING/public"
cat > "$MARKETING/public/install-command.json" << JSON
{
  "version": "${VER}",
  "label": "v${VER}",
  "url": "https://nexlify.live/install/panel.sh?v=${VER}",
  "command": "curl -fsSL 'https://nexlify.live/install/panel.sh?v=${VER}' | sudo bash"
}
JSON

rm -f prisma.config.ts
rm -rf .next src/generated/prisma

echo "-> prisma generate"
npx prisma generate 2>&1 | tail -2

echo "-> npm run build"
export NEXT_TELEMETRY_DISABLED=1
npm run build 2>&1 | tail -15

if [ ! -f .next/BUILD_ID ]; then
  echo ""
  echo "ERROR: build failed — re-run instant patch to restore live site:"
  echo "  bash $MARKETING/scripts/vps-instant-install-url-fix.sh"
  exit 1
fi

echo "-> pm2 restart"
pm2 restart nexlify-web --update-env 2>&1 | tail -2
sleep 4

echo ""
echo "=== Verify ==="
curl -fsS http://127.0.0.1:13001/install-command.json | head -1
curl -fsS http://127.0.0.1:13001/install | grep -oE 'panel\.sh[^"'\''<> ]*' | sort -u | head -5
echo ""
echo "OK — hard-refresh https://nexlify.live/install"
