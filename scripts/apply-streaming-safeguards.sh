#!/usr/bin/env bash
# Apply IPTV stability safeguards WITHOUT panel rebuild or restart when healthy.
# Safe during live traffic: scripts, cron, env, nginx reload only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
log() { echo "[streaming-guardrails] $*"; }

NO_RESTART="${NEXLIFY_SAFE_NO_RESTART:-1}"
NO_EDGE="${NEXLIFY_SAFE_NO_EDGE:-1}"

log "kill stray builds (never during peak)"
pkill -9 -f 'next/dist/bin/next build' 2>/dev/null || true
pkill -9 -f 'rebuild-panel-safe' 2>/dev/null || true
rm -rf .next.staging 2>/dev/null || true

if [ -x "$ROOT/scripts/ensure-panel-env.sh" ]; then
  bash "$ROOT/scripts/ensure-panel-env.sh"
fi

env_val() {
  grep -E "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}
PANEL_BEHIND="$(env_val PANEL_BEHIND_NGINX)"
PRIMARY="$(env_val PANEL_PRIMARY_DOMAIN)"
PORT="$(env_val PORT)"
[ -z "$PORT" ] && PORT="$(env_val PANEL_PORT)"
[ -z "$PORT" ] && PORT="13000"

# Cron: prune stale LiveConnection every minute (frees maxConnections slots).
install_cron() {
  local line="$1"
  local tag="$2"
  ( crontab -l 2>/dev/null | grep -v "$tag" || true; echo "$line" ) | crontab -
}
install_cron '* * * * * /opt/nexlify-panel/scripts/prune-stale-live-connections.sh >> /var/log/nexlify-prune-conn.log 2>&1' 'prune-stale-live-connections'
install_cron '*/5 * * * * /opt/nexlify-panel/scripts/nexlify-watchdog.sh >> /var/log/nexlify-watchdog.log 2>&1' 'nexlify-watchdog.sh'
log "cron: prune (1m) + watchdog (5m)"

# Domain panels: nginx owns :443 — restore HTTPS vhost if release script commented it out.
if [ "$PANEL_BEHIND" = "1" ] && [ -n "$PRIMARY" ] && ! echo "$PRIMARY" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  HTTPS_CONF="/etc/nginx/conf.d/nexlify-panel-https.conf"
  if [ -f "$HTTPS_CONF" ] && grep -q 'nexlify-release: listen' "$HTTPS_CONF" 2>/dev/null; then
    log "restoring nginx :443 (was commented by port-release)"
    bash "$ROOT/scripts/install-nginx-panel-https.sh" || true
  elif [ ! -f "$HTTPS_CONF" ] && [ -x "$ROOT/scripts/install-nginx-panel-https.sh" ]; then
    bash "$ROOT/scripts/install-nginx-panel-https.sh" || true
  fi
fi

health_code() {
  curl -sS -m 4 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo "000"
}

HC="$(health_code)"
log "panel health=${HC} port=${PORT}"

if [ "$NO_RESTART" = "1" ] && [ "$HC" = "200" ]; then
  log "panel healthy — skipping panel/edge restart (live traffic safe)"
else
  log "panel not healthy — safe restart via panel-restart-safe"
  export NEXLIFY_FORCE_RESTART=1
  bash "$ROOT/scripts/panel-restart-safe.sh" --nexlify-only || true
  HC="$(health_code)"
fi

if [ "$NO_EDGE" = "1" ] && [ "$HC" = "200" ]; then
  log "skipping edge reinstall/restart (live traffic safe)"
else
  bash "$ROOT/scripts/install-iptv-edge-proxy.sh" || true
fi

# Quick listener audit
if command -v ss >/dev/null 2>&1; then
  log "listeners:"
  ss -tlnp 2>/dev/null | grep -E ':443|:8080|:80|:13000' | head -8 || true
fi

log "DONE (no-restart=${NO_RESTART} health=${HC})"
