#!/usr/bin/env bash
# ffmpeg HLS restreamer — runs outside the Next.js panel process (XUI/NXT model).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NEXLIFY_HLS_DIR="${NEXLIFY_HLS_DIR:-/var/lib/nexlify/hls}"
mkdir -p "$NEXLIFY_HLS_DIR" 2>/dev/null || true
if command -v tsx >/dev/null 2>&1; then
  exec tsx "$ROOT/src/lib/hls-restream-daemon.ts"
fi
if [ -x "$ROOT/node_modules/.bin/tsx" ]; then
  exec "$ROOT/node_modules/.bin/tsx" "$ROOT/src/lib/hls-restream-daemon.ts"
fi
echo "tsx not found — cannot start HLS daemon" >&2
exit 1
