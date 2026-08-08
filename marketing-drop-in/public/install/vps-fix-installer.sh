#!/usr/bin/env bash
# Fix live panel.sh on vendor VPS when stale panel repo overwrote the marketing bundle.
# Run on VPS as root: bash /var/www/nexlify/scripts/vps-fix-installer.sh
set -euo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
INSTALL="$MARKETING/public/install"
GITHUB_RAW="${NEXLIFY_INSTALLER_RAW_URL:-https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/marketing-drop-in/public/install/panel.sh}"

echo "=== Fix live installer (panel.sh) ==="

install_ok() {
  [ -f "$1" ] && grep -q 'detect_server_address' "$1" 2>/dev/null \
    && ! grep -qE 'FATAL.*domain|--domain is required' "$1" 2>/dev/null
}

if install_ok "$INSTALL/panel.sh"; then
  echo "OK: $INSTALL/panel.sh already has auto-detect IP"
  exit 0
fi

TMP="$(mktemp /tmp/panel.sh.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

for SRC in \
  "$MARKETING/scripts/install-linux.sh" \
  "$PANEL/scripts/install-linux.sh"; do
  if install_ok "$SRC"; then
    echo "Using: $SRC"
    cp -f "$SRC" "$TMP"
    break
  fi
done

if [ ! -s "$TMP" ] && command -v curl >/dev/null 2>&1; then
  echo "Fetching latest panel.sh from GitHub..."
  if curl -fsSL "$GITHUB_RAW" -o "$TMP" && install_ok "$TMP"; then
    echo "Using GitHub main branch copy"
  else
    rm -f "$TMP"
    echo "   GitHub raw unavailable (private repo?) — trying in-place patch"
    if [ -x "$MARKETING/scripts/vps-patch-panel-installer.sh" ]; then
      bash "$MARKETING/scripts/vps-patch-panel-installer.sh" "$INSTALL/panel.sh"
      exit $?
    fi
  fi
fi

if [ ! -s "$TMP" ]; then
  echo "ERROR: Could not find a valid panel.sh with auto-detect."
  echo "Run full deploy: bash /root/vps-full-update.sh"
  exit 1
fi

mkdir -p "$INSTALL/scripts"
cp -f "$TMP" "$INSTALL/panel.sh"
chmod +x "$INSTALL/panel.sh"
[ -f "$PANEL/scripts/panel-version.sh" ] && cp -f "$PANEL/scripts/panel-version.sh" "$INSTALL/scripts/"

bash -n "$INSTALL/panel.sh"
echo "OK: $INSTALL/panel.sh updated (auto-detect IP, v1.9.7)"
echo ""
echo "Install: curl -fsSL 'https://nexlify.live/install/panel.sh?v=1.9.7' | sudo bash"
