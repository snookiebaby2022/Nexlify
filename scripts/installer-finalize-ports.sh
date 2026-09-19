#!/usr/bin/env bash
# Finalize IPTV ports after install or update: .env, nginx stream edge, UFW, verify.
# Called by install-linux.sh (one-click installer) and apply-panel-fast-update.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[nexlify-ports] $*"; }

sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

if [ -f scripts/ensure-panel-env.sh ]; then
  log "Refreshing panel .env…"
  bash scripts/ensure-panel-env.sh
fi

if command -v nginx >/dev/null 2>&1; then
  log "Ensuring nginx is enabled and running…"
  systemctl enable nginx 2>/dev/null || true
  if ! systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl start nginx 2>/dev/null || {
      log "WARN: nginx start failed — trying apt install"
      apt-get update -qq 2>/dev/null || true
      apt-get install -y -qq nginx 2>/dev/null || true
      systemctl enable nginx 2>/dev/null || true
      systemctl start nginx 2>/dev/null || true
    }
  else
    systemctl reload nginx 2>/dev/null || true
  fi
fi

if [ -f scripts/sync-panel-ports.sh ]; then
  log "Syncing stream edge + firewall…"
  if ! bash scripts/sync-panel-ports.sh; then
    log "sync-panel-ports failed — running fix-stream-edge-now.sh"
    bash scripts/fix-stream-edge-now.sh || true
  fi
elif [ -f scripts/fix-stream-edge-now.sh ]; then
  bash scripts/fix-stream-edge-now.sh || true
elif [ -f scripts/nexlify-firewall-ports.sh ]; then
  bash scripts/nexlify-firewall-ports.sh || true
fi

if [ -f scripts/verify-panel-ports.sh ]; then
  bash scripts/verify-panel-ports.sh || log "WARN: port verification reported issues"
fi

# Auto-size media/auth/panel FPM + IPTV harden (cron, classic-LB resilience).
# Safe to re-run; without this, one-click installs keep default/hand-tuned pools.
if [ -x scripts/harden-iptv-install.sh ]; then
  log "Hardening IPTV + auto-sizing capacity…"
  bash scripts/harden-iptv-install.sh || log "WARN: harden-iptv-install reported issues"
elif [ -x scripts/tune-capacity-50k.sh ]; then
  log "Auto-sizing capacity…"
  bash scripts/tune-capacity-50k.sh || log "WARN: tune-capacity-50k reported issues"
fi

log "Port finalize complete."
