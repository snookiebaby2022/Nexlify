#!/usr/bin/env bash
# Pre-flight checklist for 20k IPTV scale.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0
ok() { echo "[20k-check] OK  $*"; }
warn() { echo "[20k-check] WARN $*"; fail=1; }
bad() { echo "[20k-check] FAIL $*"; fail=1; }

set -a
[ -f .env ] && . ./.env
set +a

# Edge mode
if [ "${NEXLIFY_USE_IPTV_EDGE:-0}" = "1" ]; then ok "NEXLIFY_USE_IPTV_EDGE=1"; else bad "NEXLIFY_USE_IPTV_EDGE not enabled"; fi

# Redis
if command -v redis-cli >/dev/null 2>&1 && redis-cli -u "${REDIS_URL:-redis://127.0.0.1:6379}" ping 2>/dev/null | grep -q PONG; then
  ok "Redis PONG"
else
  bad "Redis unreachable"
fi

# PgBouncer optional
if ss -tlnp 2>/dev/null | grep -q ':6432'; then
  ok "PgBouncer listening :6432"
else
  warn "PgBouncer not on :6432 (recommended at 10k+ auth QPS)"
fi

# Edge PM2
if command -v pm2 >/dev/null 2>&1 && pm2 list 2>/dev/null | grep -q nexlify-iptv-edge; then
  ok "nexlify-iptv-edge PM2 process"
else
  warn "nexlify-iptv-edge not in PM2"
fi

# Panel workers capped
inst="${PANEL_INSTANCES:-0}"
if [ "$inst" -le 8 ] 2>/dev/null; then ok "PANEL_INSTANCES=$inst (≤8)"; else warn "PANEL_INSTANCES=$inst high for video offload model"; fi

# Kernel
somax=$(sysctl -n net.core.somaxconn 2>/dev/null || echo 0)
if [ "${somax:-0}" -ge 4096 ] 2>/dev/null; then ok "somaxconn=$somax"; else warn "somaxconn=$somax (run tune-kernel-20k.sh)"; fi

# Multi-edge
if [ -n "${EDGE_IPS:-}" ]; then
  ok "EDGE_IPS configured"
  [ -x "$ROOT/scripts/verify-multi-edge-health.sh" ] && bash "$ROOT/scripts/verify-multi-edge-health.sh" || warn "edge health check failed"
else
  warn "EDGE_IPS not set (single box — add edges for 20k)"
fi

# Playback probe
if [ -x "$ROOT/scripts/verify-iptv-playback.sh" ] && [ -n "${VERIFY_USER:-}" ] && [ -n "${VERIFY_PASS:-}" ]; then
  bash "$ROOT/scripts/verify-iptv-playback.sh" "$VERIFY_USER" "$VERIFY_PASS" "${VERIFY_BASE:-http://127.0.0.1:8080}" || bad "playback probe failed"
elif [ -x "$ROOT/scripts/verify-iptv-playback.sh" ]; then
  warn "set VERIFY_USER VERIFY_PASS for playback probe"
fi

if [ "$fail" -eq 0 ]; then
  echo "[20k-check] PASS — ready for high load"
  exit 0
fi
echo "[20k-check] INCOMPLETE — fix WARN/FAIL above"
exit 1
