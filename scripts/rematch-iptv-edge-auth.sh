#!/usr/bin/env bash
# Rematch PANEL_INTERNAL_SECRET between panel (nexlify) and nexlify-iptv-edge,
# then soft-restart the edge so live playback keeps working after panel-only deploys.
#
# Does NOT reinstall or rewrite iptv-edge-proxy.mjs — only pm2 restart --update-env.
# Safe to call after every `panel-restart-safe.sh --nexlify-only`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[rematch-iptv-edge] $*"; }

env_val() {
  local key="$1"
  [ -f .env ] || { echo ""; return 0; }
  grep -E "^${key}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' \
    | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//' || true
}

pm2_secret() {
  local app="$1"
  pm2 jlist 2>/dev/null | node -e "
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const p = list.find((x) => x.name === process.argv[1]);
    const e = p?.pm2_env?.env || {};
    process.stdout.write(String(
      e.PANEL_INTERNAL_SECRET || e.PANEL_API_SECRET || e.NEXLIFY_PANEL_API_SECRET || ''
    ));
  " "$app" 2>/dev/null || true
}

if ! command -v pm2 >/dev/null 2>&1; then
  log "SKIP: pm2 not in PATH"
  exit 0
fi

# Canonical secret = what the panel workers actually use for /api/internal/live-auth
CANON="$(pm2_secret nexlify)"
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
  log "ERROR: no PANEL_INTERNAL_SECRET on nexlify PM2 or .env"
  exit 1
fi

upsert_env() {
  local key="$1"
  local val="$2"
  local escaped
  escaped="$(printf '%s' "$val" | sed 's/[\\&|]/\\&/g')"
  if [ ! -f .env ]; then
    touch .env
  fi
  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=\"${escaped}\"|" .env
  else
    echo "${key}=\"${escaped}\"" >> .env
  fi
}

upsert_env PANEL_INTERNAL_SECRET "$CANON"
upsert_env PANEL_API_SECRET "$CANON"
upsert_env NEXLIFY_PANEL_API_SECRET "$CANON"
export PANEL_INTERNAL_SECRET="$CANON"
export PANEL_API_SECRET="$CANON"
export NEXLIFY_PANEL_API_SECRET="$CANON"

if [ -x "$ROOT/scripts/prune-stale-live-connections.sh" ]; then
  bash "$ROOT/scripts/prune-stale-live-connections.sh" || true
fi

EDGE_BEFORE="$(pm2_secret nexlify-iptv-edge)"
EDGE_ONLINE="$(pm2 jlist 2>/dev/null | node -e "
  const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const p = list.find((x) => x.name === 'nexlify-iptv-edge');
  process.stdout.write(p && p.pm2_env && p.pm2_env.status === 'online' ? '1' : '0');
" 2>/dev/null || echo 0)"

if [ "$EDGE_ONLINE" != "1" ]; then
  log "edge not online — starting via install-iptv-edge-proxy if present"
  if [ -x scripts/install-iptv-edge-proxy.sh ]; then
    bash scripts/install-iptv-edge-proxy.sh
  else
    log "SKIP: no install-iptv-edge-proxy.sh and edge offline"
    exit 0
  fi
else
  if [ "$EDGE_BEFORE" = "$CANON" ]; then
    if [ "${NEXLIFY_SAFE_NO_EDGE:-}" = "1" ]; then
      log "secrets match (len=${#CANON}) — skip edge restart (live traffic safe)"
      exit 0
    fi
    log "secrets already match (len=${#CANON}) — restarting edge to drop stale sockets"
  else
    log "SECRET mismatch (panel len=${#CANON}, edge len=${#EDGE_BEFORE}) — rematching"
  fi
  # Soft restart only: pick up .env / PM2 env, clear hung connections. No code swap.
  # If we were invoked from sync-internal-secret-env.sh, never fall through to
  # install (which could call sync again). Soft restart is enough.
  pm2 restart nexlify-iptv-edge --update-env >/dev/null
fi

# Brief settle — edge waits on panel health at boot
sleep 2

EDGE_AFTER="$(pm2_secret nexlify-iptv-edge)"
if [ -n "$EDGE_AFTER" ] && [ "$EDGE_AFTER" = "$CANON" ]; then
  log "OK panel↔edge secret match (len=${#CANON})"
  exit 0
fi

if [ "${REMATCH_IPTV_EDGE_AUTH:-}" = "1" ]; then
  log "ERROR: edge secret still wrong after soft restart (sync context — no reinstall)"
  exit 1
fi

# One more force if PM2 dump still stale
log "WARN: edge secret still diverged — force delete/start with env"
pm2 delete nexlify-iptv-edge >/dev/null 2>&1 || true
if [ -x scripts/install-iptv-edge-proxy.sh ]; then
  bash scripts/install-iptv-edge-proxy.sh
else
  log "ERROR: cannot rematch — edge secret still wrong"
  exit 1
fi

EDGE_AFTER="$(pm2_secret nexlify-iptv-edge)"
if [ -n "$EDGE_AFTER" ] && [ "$EDGE_AFTER" = "$CANON" ]; then
  log "OK panel↔edge secret match after reinstall (len=${#CANON})"
  exit 0
fi

log "ERROR: panel↔edge secret still mismatched"
exit 1
