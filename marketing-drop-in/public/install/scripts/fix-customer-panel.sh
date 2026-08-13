#!/usr/bin/env bash
# Nexlify — complete customer panel repair (update + IP env + rebuild + verify).
#
# Fixes permanently:
#   - Stuck update / toVersion TDZ crash
#   - "Application error: client-side exception" on IP installs
#   - Wrong NEXT_PUBLIC_* baked into build (rebuilds with http://<server-IP>)
#   - Missing standalone JS/CSS chunks after update
#
# Run ON THE CUSTOMER VPS as root:
#   curl -fsSL 'https://nexlify.live/install/fix-customer-panel.sh' | sudo bash
#
# Cloudflare fallback:
#   curl -fsSL 'http://85.17.162.54/install/fix-customer-panel.sh' -H 'Host: nexlify.live' | sudo bash
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
  for candidate in /home/nexlify-panel /opt/nexlify-panel; do
    if [ -f "$candidate/package.json" ]; then
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

is_ip_host() {
  [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
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
  if [ -n "${DOMAIN:-}" ] && is_ip_host "$DOMAIN"; then
    echo "$DOMAIN"
    return 0
  fi
  local from_env
  from_env="$(read_env_val PANEL_PRIMARY_DOMAIN "$PANEL/.env")"
  if is_ip_host "$from_env"; then
    echo "$from_env"
    return 0
  fi
  local ip
  ip="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 8 https://ifconfig.me 2>/dev/null || true)"
  if is_ip_host "$ip"; then
    echo "$ip"
    return 0
  fi
  if [ -n "$from_env" ]; then
    echo "$from_env"
    return 0
  fi
  echo "127.0.0.1"
}

verify_panel_ui() {
  local port="$1"
  local host="${PANEL_BIND_HOST:-127.0.0.1}"
  local ua="${NEXLIFY_VERIFY_UA:-Mozilla/5.0 (compatible; NexlifyInstallVerify/1.0)}"
  case "$host" in 0.0.0.0|::|"*") host="127.0.0.1" ;; esac
  local code chunk_code attempt

  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    code="$(curl -fsS -o /dev/null -w '%{http_code}' -H "User-Agent: $ua" "http://${host}:${port}/login" 2>/dev/null || echo 000)"
    [ "$code" = "200" ] && break
    [ "$attempt" -lt 10 ] && sleep 3
  done
  if [ "$code" != "200" ]; then
    echo "ERROR: /login returned HTTP $code (after wait; bot-stealth blocks plain curl — use a browser)" >&2
    return 1
  fi
  local html
  html="$(curl -fsS -H "User-Agent: $ua" "http://${host}:${port}/login" 2>/dev/null || true)"
  local chunk
  chunk="$(echo "$html" | grep -oE '/_next/static/[^"]+\.js' | head -1 || true)"
  if [ -z "$chunk" ]; then
    echo "ERROR: no JS chunk references in login HTML" >&2
    return 1
  fi
  chunk_code="$(curl -fsS -o /dev/null -w '%{http_code}' -H "User-Agent: $ua" "http://${host}:${port}${chunk}" 2>/dev/null || echo 000)"
  if [ "$chunk_code" != "200" ]; then
    echo "ERROR: JS chunk ${chunk} returned HTTP $chunk_code (client-side crash)" >&2
    return 1
  fi
  local chunks
  chunks="$(find "$PANEL/.next/standalone/.next/static/chunks" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [ "${chunks:-0}" -lt 1 ]; then
    echo "ERROR: standalone has 0 JS chunks" >&2
    return 1
  fi
  echo "   Verify OK: login HTTP 200, chunk HTTP 200, ${chunks} standalone chunks"
  return 0
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
  ensure-customer-ip-env.sh \
  ensure-prisma-client.sh \
  ensure-build-deps.sh \
  ensure-tsx.sh \
  run-cron-daemon.sh \
  build-cron.mjs \
  fix-panel-ip-login.sh \
  fix-stuck-customer-panel.sh \
  fix-all-customer-updates.sh \
  fix-update-worker-now.sh \
  panel-update-recover.sh \
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

# CRITICAL: persist IP in .env BEFORE any build (prevents wrong NEXT_PUBLIC_* URLs)
echo ""
echo "==> Step 0: lock IP env before any build ..."
if [ -f "$PANEL/scripts/ensure-customer-ip-env.sh" ]; then
  bash "$PANEL/scripts/ensure-customer-ip-env.sh"
  DOMAIN="$(read_env_val PANEL_PRIMARY_DOMAIN "$PANEL/.env")"
  export DOMAIN
fi

INSTALLED="$(bash "$PANEL/scripts/panel-version.sh" 2>/dev/null || node -p "require('$PANEL/package.json').version" 2>/dev/null || echo 0)"
echo "   Installed version: v${INSTALLED}"

echo ""
echo "==> Step 1: stop update loop + worker hotfix ..."
if [ -f "$PANEL/scripts/fix-update-worker-now.sh" ]; then
  bash "$PANEL/scripts/fix-update-worker-now.sh" || true
fi

# Step 2: sync only when stuck on old broken versions (never skip IP rebuild after)
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
  echo "==> Step 2: sync old panel from vendor (pre-v1.9.14) ..."
  export PANEL_VENDOR_IP PANEL_VENDOR_HOST
  bash "$PANEL/scripts/ensure-customer-ip-env.sh" || true
  bash "$PANEL/scripts/fix-all-customer-updates.sh" || echo "WARN: vendor sync failed — continuing with IP rebuild"
else
  echo ""
  echo "==> Step 2: skip vendor sync (already on v${INSTALLED})"
fi

# Step 3: ALWAYS rebuild for IP access — this is what fixes client-side exception
echo ""
echo "==> Step 3: rebuild panel for IP access (DOMAIN=$DOMAIN) ..."
if [ ! -f "$PANEL/scripts/fix-panel-ip-login.sh" ]; then
  echo "ERROR: fix-panel-ip-login.sh missing after fetch" >&2
  exit 1
fi
export DOMAIN
bash "$PANEL/scripts/fix-panel-ip-login.sh"

echo ""
echo "==> Step 4: final standalone asset check (no PM2 restart — step 3 already restarted) ..."
SKIP_PM2_RESTART=1 bash "$PANEL/scripts/vps-repair-standalone.sh"

echo ""
echo "==> Step 5: verify panel UI ..."
if [ -f "$PANEL/scripts/wait-panel-ready.sh" ]; then
  bash "$PANEL/scripts/wait-panel-ready.sh" || true
fi
PORT="$(read_env_val PORT "$PANEL/.env")"
PORT="${PORT:-80}"
verify_panel_ui "$PORT"

echo ""
echo "=========================================="
echo " SUCCESS — panel repaired"
echo " Open: http://${DOMAIN}/login"
echo " Hard-refresh browser (Ctrl+Shift+R)"
echo ""
echo " Future in-panel updates will keep IP env"
echo " (ensure-customer-ip-env runs before each build)."
echo "=========================================="
