#!/usr/bin/env bash
# VPS fix-all WITHOUT git (panel deployed via WinSCP, marketing via vps-full-update.sh).
#
# Prerequisites (from your PC after .\scripts\nexlify-fix-all.ps1):
#   1. WinSCP sync panel -> /home/nexlify-panel  (windows\scripts\sync-to-vps.ps1)
#   2. WinSCP upload marketing-drop-in/scripts/vps-full-update.sh -> /root/vps-full-update.sh
#
# Then on VPS as root:
#   bash /home/nexlify-panel/scripts/nexlify-vps-fix-no-git.sh

set -euo pipefail

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
BUNDLE="/root/vps-full-update.sh"

echo "=== Nexlify VPS fix (no git) ==="
echo "Panel:     $PANEL"
echo "Marketing: $MARKETING"
echo ""

if [ ! -d "$PANEL" ]; then
  echo "ERROR: Panel not found at $PANEL"
  exit 1
fi

if [ ! -f "$BUNDLE" ]; then
  echo "ERROR: $BUNDLE missing."
  echo "On your PC run: .\\scripts\\nexlify-fix-all.ps1"
  echo "Then WinSCP upload: marketing-drop-in\\scripts\\vps-full-update.sh -> /root/vps-full-update.sh"
  exit 1
fi

if [ ! -f "$PANEL/scripts/deploy-vps.sh" ]; then
  echo "ERROR: Panel scripts outdated. On PC run: cd windows; .\\scripts\\sync-to-vps.ps1"
  exit 1
fi

echo "-> Deploy marketing (vps-full-update.sh)"
bash "$BUNDLE"

echo "-> Deploy panel"
cd "$PANEL"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
./scripts/deploy-vps.sh

echo "-> Publish panel tarball + installer URLs"
bash scripts/publish-panel-release.sh

echo "-> Install audit helper"
if [ -f "$MARKETING/scripts/nexlify-full-platform-audit.sh" ]; then
  cp -f "$MARKETING/scripts/nexlify-full-platform-audit.sh" /root/nexlify-full-platform-audit.sh
  chmod +x /root/nexlify-full-platform-audit.sh
fi

echo "-> Cleanup"
bash scripts/nexlify-vps-cleanup.sh 2>/dev/null || true

echo "-> Audit"
if [ -x /root/nexlify-full-platform-audit.sh ]; then
  bash /root/nexlify-full-platform-audit.sh
elif [ -f "$MARKETING/scripts/nexlify-full-platform-audit.sh" ]; then
  bash "$MARKETING/scripts/nexlify-full-platform-audit.sh"
else
  echo "WARNING: audit script not found"
fi

echo ""
echo "=== VPS FIX COMPLETE ==="
