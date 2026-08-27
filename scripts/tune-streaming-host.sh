#!/usr/bin/env bash
# OS / Redis / nginx tuning for IPTV live streaming (50–5000+ viewers on one box).
# Safe to run on every panel start — idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[tune-streaming] $*"; }

# --- Kernel: more concurrent sockets (nginx → edge → upstream) ---
if command -v sysctl >/dev/null 2>&1; then
  sysctl -w net.core.somaxconn=65535 >/dev/null 2>&1 || true
  sysctl -w net.ipv4.tcp_max_syn_backlog=65535 >/dev/null 2>&1 || true
  sysctl -w net.core.netdev_max_backlog=65535 >/dev/null 2>&1 || true
  sysctl -w net.ipv4.ip_local_port_range="1024 65535" >/dev/null 2>&1 || true
fi

# --- Redis: bounded memory + LRU (auth/catalog cache must not grow without limit) ---
set -a
[ -f .env ] && . ./.env
set +a
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
if command -v redis-cli >/dev/null 2>&1; then
  if ! redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
    systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true
    sleep 1
  fi
  if redis-cli -u "$REDIS_URL" ping 2>/dev/null | grep -q PONG; then
    # Scale with RAM: min 512mb, up to 2gb on large hosts
    mem_mb="$(free -m 2>/dev/null | awk '/^Mem:/ {print $2}' || echo 8192)"
    if [ "${mem_mb:-0}" -ge 64000 ]; then
      target="2048mb"
    elif [ "${mem_mb:-0}" -ge 32000 ]; then
      target="1024mb"
    else
      target="512mb"
    fi
    cur="$(redis-cli -u "$REDIS_URL" CONFIG GET maxmemory 2>/dev/null | tail -1 || echo 0)"
    if [ "${cur:-0}" = "0" ] || [ "${cur:-0}" -lt 536870912 ]; then
      redis-cli -u "$REDIS_URL" CONFIG SET maxmemory "$target" >/dev/null 2>&1 || true
      redis-cli -u "$REDIS_URL" CONFIG SET maxmemory-policy allkeys-lru >/dev/null 2>&1 || true
      log "Redis maxmemory=$target allkeys-lru"
    fi
  else
    log "WARN: Redis not reachable at $REDIS_URL"
  fi
fi

# --- nginx: worker_connections for many parallel live clients ---
if command -v nginx >/dev/null 2>&1 && [ -f /etc/nginx/nginx.conf ]; then
  if ! grep -q 'worker_connections[[:space:]]\+[0-9]\+' /etc/nginx/nginx.conf 2>/dev/null; then
    log "nginx: worker_connections not set — consider 8192+ in /etc/nginx/nginx.conf"
  fi
fi

log "OK"
