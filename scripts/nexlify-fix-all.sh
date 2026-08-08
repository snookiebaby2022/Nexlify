#!/usr/bin/env bash
# One command: sync repo + deploy panel + deploy marketing + publish + audit (vendor VPS).
# Run as root: bash /home/nexlify-panel/scripts/nexlify-fix-all.sh

set -euo pipefail

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"

echo "=== Nexlify fix-all (VPS) ==="
echo "Panel:     $PANEL"
echo "Marketing: $MARKETING"
echo ""

cd "$PANEL"

echo "-> Git pull (origin/main)"
git fetch origin main
git reset --hard origin/main

echo "-> Sync releases + installer scripts + bundle"
bash scripts/nexlify-sync-all.sh

echo "-> Install deploy bundle to /root"
cp -f marketing-drop-in/scripts/vps-full-update.sh /root/vps-full-update.sh
chmod +x /root/vps-full-update.sh
cp -f marketing-drop-in/scripts/nexlify-full-platform-audit.sh /root/nexlify-full-platform-audit.sh
chmod +x /root/nexlify-full-platform-audit.sh

echo "-> Deploy panel"
./scripts/deploy-vps.sh

echo "-> Deploy marketing"
bash /root/vps-full-update.sh

echo "-> Publish panel tarball + installer URLs"
bash scripts/publish-panel-release.sh

echo "-> Cleanup temp/backup junk"
bash scripts/nexlify-vps-cleanup.sh

echo "-> Verify"
bash scripts/nexlify-verify-sync.sh
bash /root/nexlify-full-platform-audit.sh

echo ""
echo "=== FIX-ALL COMPLETE ==="
