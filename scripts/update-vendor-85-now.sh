#!/usr/bin/env bash
# Run as root ON vendor VPS 85.17.162.54 to update panel + marketing installer to latest main.
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/update-marketing-on-vps.sh' | sudo bash
#
# This wrapper also rebuilds the panel checkout and republishes the installer tarball.
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

echo "=== Updating vendor VPS (panel + marketing installer) ==="
curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/update-marketing-on-vps.sh' | bash

# Prefer full vendor heal if present after sync
for p in /home/nexlify /opt/nexlify-panel /home/nexlify-panel; do
  if [ -f "$p/scripts/vps-fix-everything.sh" ]; then
    echo "=== Running vps-fix-everything from $p ==="
    bash "$p/scripts/vps-fix-everything.sh" || true
    break
  fi
done

echo "=== Verify ==="
curl -fsS 'https://127.0.0.1/install/panel.sh' -H 'Host: nexlify.live' 2>/dev/null | head -5 || true
curl -fsS 'https://127.0.0.1/panel-releases.json' -H 'Host: nexlify.live' 2>/dev/null | head -c 120 || true
echo
echo "Done."
