#!/usr/bin/env bash
# Recover Prisma (if needed) and apply the published next-*.tar.gz from nexlify.live.
# Does not git-reset or compile. Safe on a panel that failed 2.0.65 → 2.0.66.
#
# Usage (on the customer VPS as root):
#   curl -fsSL 'https://nexlify.live/install/scripts/apply-nexlify-prebuilt.sh' | bash
#   VER=2.0.68 bash /opt/nexlify-panel/scripts/apply-nexlify-prebuilt.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

find_root() {
  for d in /opt/nexlify-panel /home/nexlify-panel /home/nexlify "${PANEL_REPO_PATH:-}"; do
    [ -n "$d" ] && [ -f "$d/package.json" ] && [ -d "$d/scripts" ] && echo "$d" && return 0
  done
  return 1
}

ROOT="$(find_root || true)"
if [ -z "$ROOT" ]; then
  echo "ERROR: panel install not found" >&2
  exit 1
fi
cd "$ROOT"
echo "Panel root: $ROOT"

HOST="${PANEL_VENDOR_HOST:-nexlify.live}"
IP="${PANEL_VENDOR_IP:-85.17.162.54}"
VER="${VER:-}"
if [ -z "$VER" ]; then
  VER="$(curl -fsS --max-time 20 --resolve "${HOST}:443:${IP}" "https://${HOST}/panel-releases.json" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{console.log(JSON.parse(d).latestVersion||"")}catch(e){}}')" \
    || true)"
fi
if [ -z "$VER" ]; then
  VER="$(node -e 'try{process.stdout.write(require("./package.json").version||"")}catch(e){}')"
fi
echo "Target version: $VER"

if [ -f scripts/ensure-prisma-client.sh ]; then
  bash scripts/ensure-prisma-client.sh || true
else
  npm ci --include=dev --include=optional --no-audit --no-fund --loglevel=error \
    || npm install --include=dev --include=optional --no-audit --no-fund --loglevel=error || true
  npx prisma generate || true
fi

URL="https://${HOST}/downloads/next-${VER}.tar.gz"
APPLY="$ROOT/scripts/apply-prebuilt-update.sh"
if [ ! -f "$APPLY" ]; then
  mkdir -p scripts
  curl -fsS --max-time 60 --resolve "${HOST}:443:${IP}" \
    "https://${HOST}/install/scripts/apply-prebuilt-update.sh" -o "$APPLY"
  sed -i 's/\r$//' "$APPLY"
  chmod +x "$APPLY"
fi

echo "==> applying $URL"
bash "$APPLY" "$URL" all

echo "Installed $(node -p "require('./package.json').version")"
echo "apply-nexlify-prebuilt_ok"
