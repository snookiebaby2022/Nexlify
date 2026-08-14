#!/usr/bin/env bash
# Nexlify — emergency fix-panel-down-now (panel down, blank page, or stuck mid-update).
# Brings the panel back online in ~30s (restart) or a few minutes (rebuild if needed).
#
# Prefer GitHub (nexlify.live may be stale / Cloudflare-blocked):
#   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-panel-down-now.sh' | sudo bash
#
# Vendor mirrors:
#   curl -fsSL 'https://nexlify.live/install/fix-panel-down-now.sh' | sudo bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL_VENDOR_IP="${PANEL_VENDOR_IP:-85.17.162.54}"
PANEL_VENDOR_HOST="${PANEL_VENDOR_HOST:-nexlify.live}"
INSTALL_BASE="${NEXLIFY_INSTALL_BASE:-https://nexlify.live/install}"
GH_RAW="${NEXLIFY_GH_RAW:-https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main}"
CACHE="${NEXLIFY_INSTALL_VER:-v$(date +%Y%m%d)}"

find_panel_dir() {
  for candidate in "${PANEL_DIR:-}" /home/nexlify /home/nexlify-panel /opt/nexlify-panel; do
    [ -n "$candidate" ] && [ -f "$candidate/package.json" ] && echo "$candidate" && return 0
  done
  return 1
}

curl_vendor() {
  local url="$1" dest="$2"
  if curl -fsSL -A "NexlifyPanelUpdater/1.0" "$url" -o "$dest" 2>/dev/null; then return 0; fi
  local path="${url#https://nexlify.live}"
  curl -fsSL -A "NexlifyPanelUpdater/1.0" --resolve "${PANEL_VENDOR_HOST}:443:${PANEL_VENDOR_IP}" \
    "https://${PANEL_VENDOR_HOST}${path}" -o "$dest" 2>/dev/null && return 0
  curl -fsSL -A "NexlifyPanelUpdater/1.0" \
    "http://${PANEL_VENDOR_IP}${path}" -H "Host: ${PANEL_VENDOR_HOST}" -o "$dest"
}

fetch_script() {
  local name="$1"
  mkdir -p "$PANEL/scripts"
  if curl -fsSL -A "NexlifyPanelUpdater/1.0" --max-time 60 \
    "${GH_RAW}/scripts/${name}" -o "$PANEL/scripts/${name}.new" 2>/dev/null; then
    mv "$PANEL/scripts/${name}.new" "$PANEL/scripts/${name}"
    chmod +x "$PANEL/scripts/${name}" 2>/dev/null || true
    return 0
  fi
  curl_vendor "${INSTALL_BASE}/scripts/${name}?${CACHE}" "$PANEL/scripts/${name}.new" 2>/dev/null && \
    mv "$PANEL/scripts/${name}.new" "$PANEL/scripts/${name}" && \
    chmod +x "$PANEL/scripts/${name}" 2>/dev/null || true
}

PANEL="$(find_panel_dir || true)"
if [ -z "$PANEL" ]; then
  echo "ERROR: panel not found at /home/nexlify-panel or /opt/nexlify-panel" >&2
  exit 1
fi
cd "$PANEL"

echo "=========================================="
echo " EMERGENCY panel recovery"
echo " Panel: $PANEL"
echo "=========================================="

echo "==> Ensuring PostgreSQL / Redis ..."
systemctl start postgresql 2>/dev/null || systemctl start postgresql.service 2>/dev/null || \
  service postgresql start 2>/dev/null || true
systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || \
  service redis-server start 2>/dev/null || true

for s in ensure-customer-ip-env.sh prepare-standalone.sh verify-standalone.sh \
  panel-restart-safe.sh panel-update-recover.sh vps-repair-standalone.sh \
  has-valid-next-build.sh ensure-panel-env.sh pm2-start.sh fix-panel-ip-login.sh \
  wait-panel-ready.sh verify-panel-upstream.sh; do
  fetch_script "$s" || true
done
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

echo "==> Stopping stuck update worker ..."
pkill -f 'panel-update-background' 2>/dev/null || true
pkill -f 'npm run build' 2>/dev/null || true
pkill -f 'next build' 2>/dev/null || true
pkill -f 'run-panel-build' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress
rm -rf .next.staging 2>/dev/null || true

# If live .next was wiped mid-build, restore backup / .next.old immediately
if ! bash scripts/has-valid-next-build.sh 2>/dev/null; then
  if [ -f .next.backup/BUILD_ID ] || [ -f .next.backup/standalone/server.js ]; then
    echo "==> Restoring .next.backup (panel was wiped at 88% build) ..."
    rm -rf .next
    mv .next.backup .next
  elif [ -f .next.old/BUILD_ID ] || [ -f .next.old/standalone/server.js ]; then
    echo "==> Restoring .next.old ..."
    rm -rf .next
    mv .next.old .next
  fi
fi

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

if [ -f scripts/ensure-customer-ip-env.sh ]; then
  bash scripts/ensure-customer-ip-env.sh || true
fi

# Fast path: valid build exists — restart only (~30 seconds)
if bash scripts/has-valid-next-build.sh 2>/dev/null; then
  echo "==> Valid build found — restarting (no rebuild) ..."
  bash scripts/prepare-standalone.sh 2>/dev/null || true
  bash scripts/vps-repair-standalone.sh 2>/dev/null || true
  if ! bash scripts/panel-restart-safe.sh --nexlify-only; then
    echo "==> Safe restart failed — pm2-start ..."
    bash scripts/pm2-start.sh || pm2 restart nexlify --update-env || \
      pm2 start ecosystem.config.cjs --only nexlify --update-env
  fi
else
  echo "==> No valid build — running full recover ..."
  bash scripts/panel-update-recover.sh || {
    echo "==> Recover failed — full IP rebuild ..."
    export DOMAIN="${DOMAIN:-$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)}"
    bash scripts/fix-panel-ip-login.sh
  }
fi

PORT="$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 80)"
PORT="${PORT:-80}"
BIND="$(grep '^PANEL_BIND_HOST=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 127.0.0.1)"
[ "$BIND" = "0.0.0.0" ] && BIND="127.0.0.1"
BIND="${BIND:-127.0.0.1}"

echo "==> Waiting for http://${BIND}:${PORT}/api/health ..."
ok=0
for _ in $(seq 1 30); do
  body="$(curl -sS -m 5 "http://${BIND}:${PORT}/api/health" 2>/dev/null || true)"
  if echo "$body" | grep -q '"app":"ok"'; then
    ok=1
    break
  fi
  sleep 2
done

CODE="$(curl -sS -o /dev/null -w '%{http_code}' -m 8 \
  -H "User-Agent: Mozilla/5.0 (compatible; NexlifyInstallVerify/1.0)" \
  "http://${BIND}:${PORT}/login" 2>/dev/null || echo 000)"
DOMAIN="$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
DOMAIN="${DOMAIN:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
DOMAIN="${DOMAIN:-127.0.0.1}"

echo ""
if [ "$ok" = "1" ] || [ "$CODE" = "200" ]; then
  echo "=========================================="
  echo " PANEL IS BACK ONLINE"
  echo " Open: http://${DOMAIN}/login"
  echo " Health: http://${DOMAIN}/api/health"
  echo " Auto-apply is OFF — re-enable in Settings after verifying."
  echo "=========================================="
  curl -sS -m 5 "http://${BIND}:${PORT}/api/health" || true
  echo
else
  echo "=========================================="
  echo " Panel still not responding (login HTTP $CODE)"
  echo " Diagnostics:"
  pm2 list || true
  ss -tlnp | grep -E ':80|:13000' || true
  echo " Full repair from GitHub:"
  echo "   curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/fix-remote-update-now.sh' | sudo bash"
  echo "=========================================="
  exit 1
fi
