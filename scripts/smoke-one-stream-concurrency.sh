#!/usr/bin/env bash
# One-stream max-concurrency smoke against classic LB (or panel advertise host).
#
# Does NOT hit the provider once per viewer when classic-LB is warm (shared packager).
# Still pulls MPEG-TS bytes from the LB — use a dedicated test window.
#
# Usage on panel host:
#   STREAM_ID=cmu5anma60002kvxc66spnb2l \
#   LB_HOST=http://127.0.0.1:8080 \
#   CONCURRENCY=100 DURATION=60 \
#   bash scripts/smoke-one-stream-concurrency.sh
#
# Safer auth-only (no media body):
#   METHOD=head bash scripts/smoke-one-stream-concurrency.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STREAM_ID="${STREAM_ID:-}"
LB_HOST="${LB_HOST:-http://127.0.0.1:8080}"
CONCURRENCY="${CONCURRENCY:-50}"
DURATION="${DURATION:-45}"
METHOD="${METHOD:-media}"
MEDIA_MS="${MEDIA_MS:-12000}"
LINES="${LINES:-$CONCURRENCY}"

if [ -z "$STREAM_ID" ]; then
  # Prefer currently packaging channel on colocated classic-LB
  if [ -d /var/lib/nexlify-lb/hls ]; then
    STREAM_ID="$(ls -1t /var/lib/nexlify-lb/hls 2>/dev/null | head -1 || true)"
  fi
fi
if [ -z "$STREAM_ID" ]; then
  echo "Set STREAM_ID=... (Xtream numeric or cuid)" >&2
  exit 1
fi

echo "==> ensure load-test lines (pool=$LINES)"
node scripts/load-test-setup.cjs --lines="$LINES" || true

echo "==> one-stream concurrency smoke"
echo "    host=$LB_HOST stream=$STREAM_ID concurrency=$CONCURRENCY duration=${DURATION}s method=$METHOD"
EXTRA=()
if [ "$METHOD" = "media" ]; then
  EXTRA=(--method=media --force-media --media-ms="$MEDIA_MS")
else
  EXTRA=(--method=head)
fi

node scripts/load-test-run.cjs \
  --host="$LB_HOST" \
  --concurrency="$CONCURRENCY" \
  --duration="$DURATION" \
  --stream="$STREAM_ID" \
  --lines="$LINES" \
  "${EXTRA[@]}"

echo "==> classic-LB health (if colocated)"
curl -sS -m 3 http://127.0.0.1:8090/lb/health 2>/dev/null || true
echo
echo "Done. Check Live Connections + Stream logs (playback_*) after this run."
