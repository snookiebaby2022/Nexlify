#!/usr/bin/env bash
# Source from operator scripts on the panel/LB host. Never commit real credentials.
# Example: scripts/fixtures/playback-fixture.example.json (copy to server path below).

load_playback_fixture() {
  local fix_file="${NEXLIFY_PLAYBACK_FIXTURE_FILE:-/root/.nexlify-75-playback-fixture.json}"
  local repo_root="${NEXLIFY_PANEL_ROOT:-}"
  FIX=""
  PLAYBACK_U=""
  PLAYBACK_P=""
  PLAYBACK_STREAM_ID=""

  if [ -f "$fix_file" ]; then
    FIX="$(cat "$fix_file")"
  elif [ -n "$repo_root" ] && [ -f "$repo_root/scripts/ensure-smoke-playback.cjs" ]; then
    FIX="$(cd "$repo_root" && node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1 || true)"
  else
    local here root
    here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    root="$(cd "$here/.." && pwd)"
    if [ -f "$root/ensure-smoke-playback.cjs" ]; then
      FIX="$(cd "$(cd "$here/../.." && pwd)" && node scripts/ensure-smoke-playback.cjs 2>/dev/null | tail -1 || true)"
    fi
  fi

  if [ -z "$FIX" ] || ! echo "$FIX" | grep -q '"username"'; then
    return 1
  fi

  PLAYBACK_U="$(node -e 'console.log(JSON.parse(process.argv[1]).username)' "$FIX")"
  PLAYBACK_P="$(node -e 'console.log(JSON.parse(process.argv[1]).password)' "$FIX")"
  PLAYBACK_STREAM_ID="$(node -e 'const j=JSON.parse(process.argv[1]); console.log(j.streamId||j.xtreamId||"")' "$FIX")"
  export FIX PLAYBACK_U PLAYBACK_P PLAYBACK_STREAM_ID
  return 0
}

require_playback_fixture() {
  if load_playback_fixture; then
    return 0
  fi
  echo "No playback fixture (set NEXLIFY_PLAYBACK_FIXTURE_FILE or create /root/.nexlify-75-playback-fixture.json)" >&2
  return 1
}

playback_player_api_url() {
  local base="${NEXLIFY_SMOKE_BASE:-http://127.0.0.1}"
  echo "${base}/player_api.php?username=${PLAYBACK_U}&password=${PLAYBACK_P}"
}

playback_lb_live_url() {
  local ext="${1:-ts}"
  local base="${NEXLIFY_LB_BASE:-http://127.0.0.1:8090}"
  if [ -z "$PLAYBACK_STREAM_ID" ]; then
    echo "playback_lb_live_url: missing streamId in fixture" >&2
    return 1
  fi
  echo "${base}/live/${PLAYBACK_U}/${PLAYBACK_P}/${PLAYBACK_STREAM_ID}.${ext}"
}
