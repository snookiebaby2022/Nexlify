#!/usr/bin/env bash
# git reset --hard to a panel ref, temporarily clearing chattr +i on tracked files
# (server 45 locks scripts/iptv-edge-proxy.mjs). Re-locks the edge file if live-routing.lock exists.
# Usage: bash scripts/nexlify-git-checkout.sh [ROOT] [REF]
set -euo pipefail
ROOT="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
REF="${2:-}"
cd "$ROOT"
[ -d .git ] || { echo "ERROR: not a git repo: $ROOT" >&2; exit 1; }
if [ -z "$REF" ]; then
  if [ -f "$ROOT/scripts/panel-git-ref.sh" ]; then
    REF="$(bash "$ROOT/scripts/panel-git-ref.sh" "$ROOT")"
  else
    REF="$(git rev-parse origin/main)"
  fi
fi

unlocked=()
unlock_if_immutable() {
  local f="$1"
  [ -f "$f" ] || return 0
  if lsattr -d "$f" 2>/dev/null | awk '{print $1}' | grep -q i; then
    chattr -i "$f" 2>/dev/null || true
    unlocked+=("$f")
    echo "git-checkout: chattr -i $f (immutable; blocking git reset)"
  fi
}

unlock_if_immutable "$ROOT/scripts/iptv-edge-proxy.mjs"
if command -v lsattr >/dev/null 2>&1; then
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    unlock_if_immutable "$f"
  done < <(lsattr -R "$ROOT/scripts" "$ROOT/nginx" 2>/dev/null | awk '/^[A-Za-z-]*i/{print $NF}')
fi

echo "git-checkout: reset --hard ${REF}"
git reset --hard "$REF"

# Re-lock only the live-routing edge script. Do not rewrite nginx (lock-live-routing-45.sh apply).
if [ -f /etc/nexlify/live-routing.lock ] && [ -f "$ROOT/scripts/iptv-edge-proxy.mjs" ]; then
  chattr +i "$ROOT/scripts/iptv-edge-proxy.mjs" 2>/dev/null || true
  echo "git-checkout: restored immutable scripts/iptv-edge-proxy.mjs"
fi
