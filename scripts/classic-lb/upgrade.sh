#!/usr/bin/env bash
# Upgrade existing classic-lb in place (preserves /etc/nexlify-lb/lb.env).
set -euo pipefail
cd "$(dirname "$0")/../.."
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
bash scripts/classic-lb/install.sh
systemctl disable --now nexlify-mpegts-fanout 2>/dev/null || true
systemctl is-active php8.4-fpm php8.3-fpm nginx redis-server 2>/dev/null || true
ss -lntp | grep -E ':(8090|8091) ' || true
curl -fsS http://127.0.0.1:${LISTEN_HTTP:-8090}/lb/health || true
echo
