#!/usr/bin/env bash
# Nexlify — fix IP install login (port 80, no :3000). Works on older panel builds.
#
#   curl -fsSL 'https://nexlify.live/install/fix-ip-login.sh?v=164' | sudo bash
#
# Or if already on the server:
#   curl -fsSL 'https://nexlify.live/install/fix-ip-login.sh?v=164' -o /tmp/fix-ip-login.sh
#   sudo bash /tmp/fix-ip-login.sh
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
INSTALL_BASE="${NEXLIFY_INSTALL_BASE:-https://nexlify.live/install}"
VER="${NEXLIFY_INSTALL_VER:-v164}"

if [ ! -d "$PANEL_DIR" ]; then
  echo "ERROR: Panel not found at $PANEL_DIR" >&2
  exit 1
fi
cd "$PANEL_DIR"

fetch_script() {
  local name="$1"
  local dest="scripts/${name}"
  mkdir -p scripts
  if [ -f "$dest" ] && [ "${FORCE_FETCH:-0}" != "1" ]; then
    return 0
  fi
  echo "==> Fetching scripts/${name}"
  curl -fsSL "${INSTALL_BASE}/scripts/${name}?${VER}" -o "$dest"
  chmod +x "$dest" 2>/dev/null || true
}

for s in fix-panel-ip-login.sh panel-port-config.sh ensure-panel-env.sh verify-install-smoke.sh verify-install-login.sh pm2-start.sh; do
  fetch_script "$s"
done
for s in set-admin-password.cjs load-env.cjs; do
  fetch_script "$s"
done

if [ -f scripts/fix-panel-ip-login.sh ]; then
  exec bash scripts/fix-panel-ip-login.sh
fi

echo "ERROR: Could not run fix-panel-ip-login.sh" >&2
exit 1
