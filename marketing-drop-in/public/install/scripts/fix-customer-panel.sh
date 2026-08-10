#!/usr/bin/env bash
# Nexlify — one-shot customer panel repair (update + IP login + standalone assets).
#
# Fixes:
#   - Stuck update / toVersion TDZ crash (v1.9.7–v1.9.13)
#   - "Application error: client-side exception" on IP installs after update
#   - Wrong NEXT_PUBLIC_* URLs (rebuilds with correct http://<IP>)
#
# Run ON THE CUSTOMER VPS (SSH as root):
#   curl -fsSL 'https://nexlify.live/install/fix-customer-panel.sh' | sudo bash
#
# If Cloudflare blocks curl, use vendor origin IP:
#   curl -fsSL 'http://85.17.162.54/install/fix-customer-panel.sh' -H 'Host: nexlify.live' | sudo bash
#
# Override panel path or IP if needed:
#   PANEL_DIR=/opt/nexlify-panel DOMAIN=1.2.3.4 curl -fsSL '...' | sudo bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

PANEL_VENDOR_IP="${PANEL_VENDOR_IP:-85.17.162.54}"
PANEL_VENDOR_HOST="${PANEL_VENDOR_HOST:-nexlify.live}"
INSTALL_BASE="${NEXLIFY_INSTALL_BASE:-https://nexlify.live/install}"
CACHE="${NEXLIFY_INSTALL_VER:-v$(date +%Y%m%d)}"

find_panel_dir() {
  if [ -n "${PANEL_DIR:-}" ] && [ -f "${PANEL_DIR}/package.json" ]; then
    echo "$PANEL_DIR"
    return 0
  fi
  for candidate in /opt/nexlify-panel /home/nexlify-panel; do
    if [ -f "$candidate/package.json" ] && [ -f "$candidate/scripts/fix-panel-ip-login.sh" -o -f "$candidate/src/lib/panel-update.ts" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

read_env_val() {
  local key="$1" file="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

curl_vendor() {
  local url="$1" dest="$2"
  local ua="NexlifyPanelUpdater/1.0"
  if curl -fsSL -A "$ua" --retry 2 "$url" -o "$dest" 2>/dev/null; then return 0; fi
  local path=""
  if [[ "$url" == https://nexlify.live/* ]]; then path="${url#https://nexlify.live}";
  elif [[ "$url" == https://${PANEL_VENDOR_HOST}/* ]]; then path="${url#https://${PANEL_VENDOR_HOST}}"; fi
  if [ -n "$path" ]; then
    echo "WARN: CDN blocked — fetch via http://${PANEL_VENDOR_IP}${path}" >&2
    curl -fsSL -A "$ua" "http://${PANEL_VENDOR_IP}${path}" -H "Host: ${PANEL_VENDOR_HOST}" -o "$dest"
    return $?
  fi
  return 1
}

fetch_script() {
  local name="$1"
  local dest="$PANEL/scripts/$name"
  mkdir -p "$PANEL/scripts"
  if curl_vendor "${INSTALL_BASE}/scripts/${name}?${CACHE}" "${dest}.new"; then
    sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
    chmod +x "${dest}.new" 2>/dev/null || true
    mv "${dest}.new" "$dest"
    echo "   Fetched scripts/$name"
  fi
}

detect_domain() {
  if [ -n "${DOMAIN:-}" ]; then
    echo "$DOMAIN"
    return 0
  fi
  local from_env
  from_env="$(read_env_val PANEL_PRIMARY_DOMAIN "$PANEL/.env")"
  if [[ "$from_env" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$from_env"
    return 0
  fi
  local ip
  ip="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
  if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "$ip"
    return 0
  fi
  if [ -n "$from_env" ]; then
    echo "$from_env"
    return 0
  fi
  echo "127.0.0.1"
}

PANEL="$(find_panel_dir || true)"
if [ -z "$PANEL" ]; then
  echo "ERROR: Nexlify panel not found. Set PANEL_DIR=/path/to/panel" >&2
  exit 1
fi
cd "$PANEL"
export PANEL_DIR="$PANEL"

DOMAIN="$(detect_domain)"
export DOMAIN

echo "=========================================="
echo " Nexlify customer panel repair"
echo " Panel:  $PANEL"
echo " Domain: $DOMAIN"
echo "=========================================="

echo ""
echo "==> Fetching latest repair scripts ..."
for s in \
  fix-panel-ip-login.sh \
  fix-stuck-customer-panel.sh \
  fix-all-customer-updates.sh \
  fix-update-worker-now.sh \
  vps-repair-standalone.sh \
  prepare-standalone.sh \
  verify-standalone.sh \
  ensure-panel-env.sh \
  panel-port-config.sh \
  pm2-start.sh \
  verify-install-smoke.sh \
  verify-install-login.sh \
  set-admin-password.cjs \
  load-env.cjs; do
  fetch_script "$s" || true
done
curl_vendor "${INSTALL_BASE}/apply-panel-fast-update.sh?${CACHE}" "$PANEL/scripts/apply-panel-fast-update.sh" 2>/dev/null && \
  chmod +x "$PANEL/scripts/apply-panel-fast-update.sh" 2>/dev/null || true

INSTALLED="$(bash "$PANEL/scripts/panel-version.sh" 2>/dev/null || node -p "require('$PANEL/package.json').version" 2>/dev/null || echo 0)"
echo "   Installed version: v${INSTALLED}"

# Step 1: stop update retry loop + patch TDZ if on old version
if [ -f "$PANEL/scripts/fix-update-worker-now.sh" ]; then
  echo ""
  echo "==> Step 1: stop update loop + worker hotfix ..."
  bash "$PANEL/scripts/fix-update-worker-now.sh" || true
fi

# Step 2: sync from vendor if still on pre-1.9.14 or user forced sync
NEEDS_SYNC=0
if [ "${FORCE_SYNC:-0}" = "1" ]; then NEEDS_SYNC=1; fi
if [ -f "$PANEL/src/lib/panel-update.ts" ] && ! grep -q 'let toVersion = fromVersion' "$PANEL/src/lib/panel-update.ts" 2>/dev/null; then
  NEEDS_SYNC=1
fi
case "$INSTALLED" in
  1.9.7|1.9.8|1.9.9|1.9.10|1.9.11|1.9.12|1.9.13) NEEDS_SYNC=1 ;;
esac

if [ "$NEEDS_SYNC" = "1" ] && [ -f "$PANEL/scripts/fix-all-customer-updates.sh" ]; then
  echo ""
  echo "==> Step 2: sync + build latest panel from vendor ..."
  export PANEL_VENDOR_IP PANEL_VENDOR_HOST
  bash "$PANEL/scripts/fix-all-customer-updates.sh" || echo "WARN: vendor sync failed — continuing with IP rebuild"
else
  echo ""
  echo "==> Step 2: skip vendor sync (panel already updated)"
fi

# Step 3: IP login fix — rebuild with correct NEXT_PUBLIC_* (fixes client-side exception)
echo ""
echo "==> Step 3: rebuild for IP/domain access (DOMAIN=$DOMAIN) ..."
if [ ! -f "$PANEL/scripts/fix-panel-ip-login.sh" ]; then
  echo "ERROR: fix-panel-ip-login.sh missing after fetch" >&2
  exit 1
fi
bash "$PANEL/scripts/fix-panel-ip-login.sh"

# Step 4: ensure standalone static assets
echo ""
echo "==> Step 4: verify standalone static assets ..."
if [ -f "$PANEL/scripts/vps-repair-standalone.sh" ]; then
  bash "$PANEL/scripts/vps-repair-standalone.sh" || true
fi

echo ""
echo "=========================================="
echo " DONE — open: http://${DOMAIN}/login"
echo " Hard-refresh browser (Ctrl+Shift+R) if cached."
echo "=========================================="
