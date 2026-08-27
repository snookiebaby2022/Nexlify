#!/usr/bin/env bash
# Extended kernel / file descriptor tuning for 10k–20k concurrent IPTV sockets.
# Idempotent — safe to run on panel and edge nodes.
set -euo pipefail
log() { echo "[tune-20k] $*"; }

apply_sysctl() {
  local key="$1" val="$2"
  sysctl -w "${key}=${val}" >/dev/null 2>&1 || true
}

if command -v sysctl >/dev/null 2>&1; then
  apply_sysctl net.core.somaxconn "${NEXLIFY_NET_CORE_SOMAXCONN:-65535}"
  apply_sysctl net.ipv4.tcp_max_syn_backlog 65535
  apply_sysctl net.core.netdev_max_backlog 65535
  apply_sysctl net.ipv4.ip_local_port_range "1024 65535"
  apply_sysctl net.ipv4.tcp_fin_timeout 15
  apply_sysctl net.ipv4.tcp_tw_reuse 1
  apply_sysctl net.core.rmem_max 16777216
  apply_sysctl net.core.wmem_max 16777216
  apply_sysctl net.ipv4.tcp_rmem "4096 87380 16777216"
  apply_sysctl net.ipv4.tcp_wmem "4096 65536 16777216"
  apply_sysctl fs.file-max 2097152
  log "sysctl applied"
fi

# Persist if sysctl.d available
if [ -d /etc/sysctl.d ]; then
  cat > /etc/sysctl.d/99-nexlify-iptv.conf <<'SYSCTL'
# Nexlify IPTV 20k tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
fs.file-max = 2097152
SYSCTL
  sysctl --system >/dev/null 2>&1 || true
fi

# PM2 / shell limits
if [ -f /etc/security/limits.d/nexlify.conf ]; then
  log "limits.d already present"
else
  mkdir -p /etc/security/limits.d
  cat > /etc/security/limits.d/nexlify.conf <<'LIMITS'
* soft nofile 1048576
* hard nofile 1048576
root soft nofile 1048576
root hard nofile 1048576
LIMITS
  log "wrote /etc/security/limits.d/nexlify.conf (re-login for full effect)"
fi

# nginx worker_connections hint
if [ -f /etc/nginx/nginx.conf ] && ! grep -q 'worker_connections[[:space:]]\+16384' /etc/nginx/nginx.conf 2>/dev/null; then
  log "TIP: set worker_connections 16384 in /etc/nginx/nginx.conf events {}"
fi

log "OK"
