#!/usr/bin/env bash
# DISABLED — 302 offload breaks Xtream players. Use proxy lock instead.
set -euo pipefail
echo "[offload] refused: HTTP 302 for /live/ breaks VLC/Smarters/TiviMate/XCIPTV" >&2
echo "[offload] applying locked proxy path instead" >&2
exec bash "$(dirname "$0")/lock-live-routing-45.sh"
