#!/usr/bin/env bash
# EMERGENCY: panel down, blank page, or stuck mid-update.
# Brings the panel back online in ~30s (restart) or ~5min (rebuild if needed).
#
# Run ON CUSTOMER VPS as root:
#   curl -fsSL 'https://nexlify.live/install/fix-panel-down-now.sh' | sudo bash
#
# Cloudflare fallback:
#   curl -fsSL 'http://85.17.162.54/install/fix-panel-down-now.sh' -H 'Host: nexlify.live' | sudo bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL_VENDOR_IP="${PANEL_VENDOR_IP:-85.17.162.54}"
PANEL_VENDOR_HOST="${PANEL_VENDOR_HOST:-nexlify.live}"
INSTALL_BASE="${NEXLIFY_INSTALL_BASE:-https://nexlify.live/install}"
CACHE="${NEXLIFY_INSTALL_VER:-v$(date +%Y%m%d)}"

find_panel_dir() {
  for candidate in "${PANEL_DIR:-}" /opt/nexlify-panel /home/nexlify-panel; do
    [ -n "$candidate" ] && [ -f "$candidate/package.json" ] && echo "$candidate" && return 0
  done
  return 1
}

curl_vendor() {
  local url="$1" dest="$2"
  if curl -fsSL -A "NexlifyPanelUpdater/1.0" "$url" -o "$dest" 2>/dev/null; then return 0; fi
  local path="${url#https://nexlify.live}"
  curl -fsSL -A "NexlifyPanelUpdater/1.0" \
    "http://${PANEL_VENDOR_IP}${path}" -H "Host: ${PANEL_VENDOR_HOST}" -o "$dest"
}

fetch_script() {
  local name="$1"
  mkdir -p "$PANEL/scripts"
  curl_vendor "${INSTALL_BASE}/scripts/${name}?${CACHE}" "$PANEL/scripts/${name}.new" 2>/dev/null && \
    mv "$PANEL/scripts/${name}.new" "$PANEL/scripts/${name}" && \
    chmod +x "$PANEL/scripts/${name}" 2>/dev/null || true
}

PANEL="$(find_panel_dir || true)"
if [ -z "$PANEL" ]; then
  echo "ERROR: panel not found at /opt/nexlify-panel or /home/nexlify-panel" >&2
  exit 1
fi
cd "$PANEL"

echo "=========================================="
echo " EMERGENCY panel recovery"
echo " Panel: $PANEL"
echo "=========================================="

for s in ensure-customer-ip-env.sh prepare-standalone.sh verify-standalone.sh \
  panel-restart-safe.sh panel-update-recover.sh vps-repair-standalone.sh \
  has-valid-next-build.sh ensure-panel-env.sh pm2-start.sh fix-panel-ip-login.sh; do
  fetch_script "$s" || true
done

echo "==> Stopping stuck update worker ..."
pkill -f 'panel-update-background' 2>/dev/null || true
pkill -f 'npm run build' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress
rm -rf .next.staging 2>/dev/null || true

# Disable auto-apply so page reload doesn't restart a broken update
if [ -f data/panel.db ]; then
  node -e "
    const { execSync } = require('child_process');
    try {
      const raw = execSync(\"sqlite3 data/panel.db \\\"SELECT value FROM PanelSetting WHERE key='server';\\\"\", { encoding: 'utf8' }).trim();
      if (!raw) process.exit(0);
      const j = JSON.parse(raw);
      j.panelUpdateAutoDownload = false;
      const esc = JSON.stringify(j).replace(/'/g, \"''\");
      execSync(\"sqlite3 data/panel.db \\\"UPDATE PanelSetting SET value='\" + esc + \"' WHERE key='server';\\\"\");
      console.log('Disabled auto-apply (prevents retry loop)');
    } catch {}
  " 2>/dev/null || true
fi

if [ -f .update-progress.json ]; then
  node -e "
    const fs=require('fs');
    try {
      const j=JSON.parse(fs.readFileSync('.update-progress.json','utf8'));
      if(j.status==='running'){
        j.status='failed';
        j.finishedAt=new Date().toISOString();
        j.message='Cancelled by fix-panel-down-now.sh — panel recovered.';
        fs.writeFileSync('.update-progress.json',JSON.stringify(j,null,2));
      }
    } catch { fs.unlinkSync('.update-progress.json'); }
  " 2>/dev/null || rm -f .update-progress.json
fi

if [ -x scripts/ensure-customer-ip-env.sh ]; then
  bash scripts/ensure-customer-ip-env.sh || true
fi

# Fast path: valid build exists — restart only (~30 seconds)
if bash scripts/has-valid-next-build.sh 2>/dev/null; then
  echo "==> Valid build found — restarting (no rebuild) ..."
  bash scripts/prepare-standalone.sh 2>/dev/null || true
  bash scripts/vps-repair-standalone.sh 2>/dev/null || true
  bash scripts/panel-restart-safe.sh --nexlify-only
else
  echo "==> No valid build — running full recover ..."
  bash scripts/panel-update-recover.sh || {
    echo "==> Recover failed — full IP rebuild ..."
    export DOMAIN="${DOMAIN:-$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)}"
    bash scripts/fix-panel-ip-login.sh
  }
fi

PORT="$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- || echo 80)"
PORT="${PORT:-80}"
sleep 3
CODE="$(curl -fsS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/login" 2>/dev/null || echo 000)"
DOMAIN="$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- || echo 127.0.0.1)"

echo ""
if [ "$CODE" = "200" ]; then
  echo "=========================================="
  echo " PANEL IS BACK ONLINE"
  echo " Open: http://${DOMAIN}/login"
  echo " Auto-apply is OFF — re-enable in Settings after verifying."
  echo "=========================================="
else
  echo "=========================================="
  echo " Panel still not responding (HTTP $CODE on /login)"
  echo " Run full repair:"
  echo "   curl -fsSL 'https://nexlify.live/install/fix-customer-panel.sh' | sudo bash"
  echo "=========================================="
  exit 1
fi
