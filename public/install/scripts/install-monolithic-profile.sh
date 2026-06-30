#!/usr/bin/env bash
# Monolithic profile: ensure main server row + agent token in DB (run from install-linux.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  DOMAIN="$(grep '^PANEL_PRIMARY_DOMAIN=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
fi
[ -n "$DOMAIN" ] || { echo "ERROR: domain required" >&2; exit 1; }

npx tsx scripts/ensure-monolithic-server.ts --domain "$DOMAIN"
