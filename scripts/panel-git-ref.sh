#!/usr/bin/env bash
# Last origin/main commit that touches IPTV panel paths — skip marketing-only HEAD.
# Server 45 (and other fleet panels) must not reset onto marketing-drop-in commits.
#
# Pin (first match wins):
#   NEXLIFY_GIT_REF env, /etc/nexlify/panel-git-ref, .env NEXLIFY_GIT_REF=
set -euo pipefail
ROOT="$(cd "${1:-.}" && pwd)"
cd "$ROOT"
[ -d .git ] || exit 1

read_pin() {
  local raw="$1"
  raw="$(printf '%s' "$raw" | head -1 | tr -d '\r' | sed 's/#.*//; s/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'\'']//; s/["'\'']$//')"
  [ -n "$raw" ] || return 1
  git rev-parse --verify "${raw}^{commit}" 2>/dev/null
}

if [ -n "${NEXLIFY_GIT_REF:-}" ]; then
  read_pin "$NEXLIFY_GIT_REF"
  exit 0
fi

if [ -f /etc/nexlify/panel-git-ref ]; then
  if pin="$(read_pin "$(cat /etc/nexlify/panel-git-ref)")"; then
    printf '%s\n' "$pin"
    exit 0
  fi
fi

if [ -f "$ROOT/.env" ]; then
  env_pin="$(grep -E '^NEXLIFY_GIT_REF=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  if pin="$(read_pin "$env_pin")"; then
    printf '%s\n' "$pin"
    exit 0
  fi
fi

ref="$(
  git rev-list -n 1 origin/main -- \
    src \
    scripts \
    prisma \
    public \
    package.json \
    package-lock.json \
    ecosystem.config.cjs \
    next.config.ts \
    tsconfig.json \
    2>/dev/null || true
)"
if [ -z "${ref}" ]; then
  ref="$(git rev-parse origin/main)"
fi
printf '%s\n' "$ref"
