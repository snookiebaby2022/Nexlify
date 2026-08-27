#!/usr/bin/env bash
# Hot-reload IPTV edge only (no panel rebuild) — safe during live traffic.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash "$ROOT/scripts/install-iptv-edge-proxy.sh"
echo "[edge-hotfix] nexlify-iptv-edge restarted"
