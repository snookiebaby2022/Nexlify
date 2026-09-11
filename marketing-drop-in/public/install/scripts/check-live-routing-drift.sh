#!/usr/bin/env bash
# Repo + (optional) host drift check for live-routing lock invariants.
# Usage:
#   bash scripts/check-live-routing-drift.sh           # repo templates only
#   bash scripts/check-live-routing-drift.sh --host    # also inspect /etc/nginx on this box
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

check_no_302() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "SKIP missing $file"
    return 0
  fi
  # Flag return 302 near live/timeshift/movie/series location blocks (heuristic).
  if grep -nE 'location[[:space:]]+.*(live|timeshift|movie|series)' "$file" >/dev/null 2>&1; then
    if awk '
      /location[[:space:]]+.*(live|timeshift|movie|series)/ { inloc=1 }
      inloc && /}/ { inloc=0 }
      inloc && /return[[:space:]]+302/ { bad=1 }
      END { exit bad ? 1 : 0 }
    ' "$file"; then
      :
    else
      echo "FAIL: return 302 inside live/media location in $file" >&2
      FAIL=1
    fi
  fi
}

echo "== repo nginx templates =="
for f in nginx.conf nginx/nexlify.conf nginx/nexlify-stream-server.conf; do
  check_no_302 "$ROOT/$f"
done

# Panel must not advertise 302 for media in locked snippets.
if grep -R -n --include='*.conf' -E 'return[[:space:]]+302' "$ROOT/nginx" 2>/dev/null | grep -Ei 'live|timeshift|movie|series'; then
  echo "WARN: 302 near media path keywords in nginx/ (review manually)" >&2
fi

if [ "${1:-}" = "--host" ]; then
  echo "== host nginx conf.d =="
  for f in \
    /etc/nginx/conf.d/nexlify-live-remote-edge.conf \
    /etc/nginx/conf.d/nexlify-panel-http.conf \
    /etc/nginx/conf.d/nexlify-panel-https.conf; do
    check_no_302 "$f"
  done
  if [ -f /etc/nexlify/live-routing.lock ]; then
    echo "OK live-routing.lock present"
    cat /etc/nexlify/live-routing.lock
  else
    echo "WARN: /etc/nexlify/live-routing.lock missing (run scripts/lock-live-routing.sh on this panel)"
  fi
fi

if [ "$FAIL" -ne 0 ]; then
  echo "LIVE_ROUTING_DRIFT_FAIL"
  exit 1
fi
echo "LIVE_ROUTING_DRIFT_OK"
