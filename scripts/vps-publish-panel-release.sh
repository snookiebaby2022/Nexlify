#!/usr/bin/env bash
# Publish panel v1.9.8+ tarball + release feed so customer panels can update in-app.
# Run on vendor VPS (85.17.162.54) as root:
#   cd /home/nexlify-panel && git pull origin main && bash scripts/vps-publish-panel-release.sh
set -euo pipefail

PANEL="${NEXLIFY_PANEL_DIR:-/home/nexlify-panel}"
MARKETING="${MARKETING_DIR:-/var/www/nexlify}"

echo "==> Panel publish (in-app update feed + tarball)"
[ -d "$PANEL" ] || { echo "ERROR: panel dir missing: $PANEL"; exit 1; }
[ -d "$MARKETING" ] || { echo "ERROR: marketing dir missing: $MARKETING"; exit 1; }

cd "$PANEL"
VER="$(node -p "require('./package.json').version")"
echo "Panel source version: $VER"

echo "-> Sync panel-releases.json to marketing"
npm run sync:releases

echo "-> Publish tarball to $MARKETING/public/downloads/"
SKIP_INSTALL_SCRIPT_PUBLISH=1 bash scripts/publish-panel-release.sh

echo "-> Rebuild marketing site (panel-releases API)"
cd "$MARKETING"
cp -f "$PANEL/marketing-drop-in/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json" 2>/dev/null \
  || cp -f "$PANEL/src/lib/panel-releases.json" "$MARKETING/src/lib/panel-releases.json"
npm run build
pm2 restart nexlify-web --update-env
pm2 save 2>/dev/null || true

echo ""
echo "Verify:"
curl -fsS "http://127.0.0.1:13001/api/panel-releases" | head -c 200 || true
echo ""
curl -fsSI "http://127.0.0.1:13001/downloads/nexlify-panel.tar.gz" | head -3 || true
echo ""
echo "Done. Customer panels on older versions can now use Admin → Settings → Updates."
