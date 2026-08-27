#!/usr/bin/env bash
# Full streaming stack deploy: build panel + restart edge + reload panel workers.
# Uses streaming guard — run off-peak or pass FORCE=1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

log() { echo "[streaming-full] $*"; }

if [ "${FORCE:-0}" != "1" ] && [ -f "$ROOT/scripts/nexlify-streaming-guard.sh" ]; then
  # shellcheck disable=SC1091
  . "$ROOT/scripts/nexlify-streaming-guard.sh"
  if ! nexlify_refuse_build_if_streaming_busy; then
    log "REFUSE — IPTV load too high. Retry off-peak or FORCE=1"
    exit 1
  fi
fi
if [ "${FORCE:-0}" = "1" ]; then
  export NEXLIFY_FORCE_BUILD=1
fi

if [ -x "$ROOT/scripts/ensure-panel-env.sh" ]; then
  bash "$ROOT/scripts/ensure-panel-env.sh"
fi

# Patch live-auth: HLS-only streams remux at edge (not panel passthrough).
LIVE_AUTH="$ROOT/src/app/api/internal/live-auth/route.ts"
if [ -f "$LIVE_AUTH" ] && grep -q 'candidates.some((u) => isHlsPlaybackUrl(u))' "$LIVE_AUTH"; then
  log "patch live-auth for edge HLS remux"
  chattr -i "$LIVE_AUTH" 2>/dev/null || true
  perl -0pi -e 's/\} else if \(candidates\.some\(\(u\) => isHlsPlaybackUrl\(u\)\)\) \{\n      return new NextResponse\(null, \{ status: 204, headers: \{ "X-Nexlify-Passthrough": "1" \} \}\);\n    \}/} else {\n      const hlsUrl = candidates.find((u) => isHlsPlaybackUrl(u) && isSafeUpstreamUrl(u));\n      if (hlsUrl) upstream = hlsUrl;\n    }/s' "$LIVE_AUTH"
fi

if [ -x "$ROOT/scripts/rebuild-panel-safe.sh" ]; then
  bash "$ROOT/scripts/rebuild-panel-safe.sh"
else
  log "WARN: rebuild-panel-safe.sh missing — skipping build"
fi

if [ -x "$ROOT/scripts/install-iptv-edge-proxy.sh" ]; then
  bash "$ROOT/scripts/install-iptv-edge-proxy.sh"
fi

if [ -x "$ROOT/scripts/install-streaming-stability-cron.sh" ]; then
  bash "$ROOT/scripts/install-streaming-stability-cron.sh"
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 reload nexlify --update-env || pm2 restart nexlify --update-env
  set -a
  # shellcheck disable=SC1091
  [ -f .env ] && . ./.env
  set +a
  want=$(( ${PANEL_INSTANCES:-4} + ${NEXLIFY_PANEL_WORKER_SPARE:-1} ))
  if [ "$want" -lt 3 ]; then want=3; fi
  if [ "${NEXLIFY_PANEL_INSTANCES_MAX:-6}" -lt "$want" ]; then
    want="${NEXLIFY_PANEL_INSTANCES_MAX:-6}"
  fi
  log "scale panel workers to ${want} (IPTV on edge)"
  pm2 scale nexlify "$want" --update-env 2>/dev/null || true
  pm2 save >/dev/null 2>&1 || true
fi

if [ -x "$ROOT/scripts/prune-stale-live-connections.sh" ]; then
  bash "$ROOT/scripts/prune-stale-live-connections.sh" || true
fi

log "DONE — full streaming deploy complete"
