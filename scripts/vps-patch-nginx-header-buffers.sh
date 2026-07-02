#!/usr/bin/env bash
# Re-apply full nginx :3000 config (safer than sed patch — avoids broken config + 500 errors)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/vps-fix-400-port-3000.sh"
