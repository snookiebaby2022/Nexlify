#!/usr/bin/env bash
# Keep PANEL_INTERNAL_SECRET aligned across .env, nexlify PM2, and nexlify-iptv-edge.
# Edge live-auth returns 403 for all HLS/m3u8 when secrets diverge.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
[ -f "$PANEL_DIR/package.json" ] || PANEL_DIR="/home/nexlify-panel"
cd "$PANEL_DIR"

env_val() {
  local key="$1"
  [ -f .env ] || { echo ""; return 0; }
  grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//' || true
}

CANON=""
if command -v pm2 >/dev/null 2>&1; then
  CANON="$(pm2 jlist 2>/dev/null | node -e "
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const p = list.find((x) => x.name === 'nexlify');
    const e = p?.pm2_env?.env || {};
    process.stdout.write(String(e.PANEL_INTERNAL_SECRET || e.PANEL_API_SECRET || e.NEXLIFY_PANEL_API_SECRET || ''));
  " 2>/dev/null || true)"
fi

if [ -z "$CANON" ]; then
  CANON="$(env_val PANEL_INTERNAL_SECRET)"
fi
if [ -z "$CANON" ]; then
  CANON="$(env_val PANEL_API_SECRET)"
fi
if [ -z "$CANON" ]; then
  CANON="$(env_val NEXLIFY_PANEL_API_SECRET)"
fi

if [ -z "$CANON" ]; then
  echo "[sync-internal-secret] ERROR: no panel internal secret found (.env or nexlify PM2)" >&2
  exit 1
fi

upsert_env() {
  local key="$1"
  local val="$2"
  local escaped
  escaped="$(printf '%s' "$val" | sed 's/[\\&|]/\\&/g')"
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=\"${escaped}\"|" .env
  else
    echo "${key}=\"${escaped}\"" >> .env
  fi
}

upsert_env PANEL_INTERNAL_SECRET "$CANON"
upsert_env PANEL_API_SECRET "$CANON"
upsert_env NEXLIFY_PANEL_API_SECRET "$CANON"

echo "[sync-internal-secret] .env secrets updated (len=${#CANON})"

export PANEL_INTERNAL_SECRET="$CANON"
export PANEL_API_SECRET="$CANON"
export NEXLIFY_PANEL_API_SECRET="$CANON"

# Prefer soft rematch (restart edge with matching env). Full install only if rematch missing.
# Guard against rematch→sync recursion via REMATCH_IPTV_EDGE_AUTH=1.
if [ -x scripts/rematch-iptv-edge-auth.sh ]; then
  REMATCH_IPTV_EDGE_AUTH=1 bash scripts/rematch-iptv-edge-auth.sh
elif [ -x scripts/install-iptv-edge-proxy.sh ]; then
  bash scripts/install-iptv-edge-proxy.sh
else
  pm2 restart nexlify-iptv-edge --update-env 2>/dev/null || true
fi

echo "[sync-internal-secret] OK"
