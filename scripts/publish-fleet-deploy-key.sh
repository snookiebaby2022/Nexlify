#!/usr/bin/env bash
# Publish the fleet GitHub deploy key to nexlify.live so customer panels fetch it on update.
#
# Workflow:
#   1) Install key on server 75 (or any panel): install-fleet-deploy-key.sh
#   2) Run THIS on that same server (or from PC with the key file):
#        bash scripts/publish-fleet-deploy-key.sh
#   3) Push a panel release — all servers run ensure-fleet-deploy-key.sh during update
#
# Env:
#   NEXLIFY_DEPLOY_KEY_FILE  — private key to publish (default: /root/.nexlify/github-deploy-key)
#   NEXLIFY_VENDOR_HOST      — vendor VPS (default: 85.17.162.54)
#   NEXLIFY_VENDOR_SECRETS   — remote dir (default: /var/www/nexlify/public/install/secrets)
set -euo pipefail

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo -E bash "$0" "$@"
fi

SRC="${NEXLIFY_DEPLOY_KEY_FILE:-/root/.nexlify/github-deploy-key}"
VENDOR_HOST="${NEXLIFY_VENDOR_HOST:-85.17.162.54}"
VENDOR_DIR="${NEXLIFY_VENDOR_SECRETS:-/var/www/nexlify/public/install}"
LOCAL_MARKETING="${NEXLIFY_LOCAL_MARKETING:-}"

[ -s "$SRC" ] || { echo "ERROR: missing private key at $SRC" >&2; exit 1; }

echo "==> Public key (must be in GitHub Deploy keys):"
ssh-keygen -y -f "$SRC"

if [ -n "$LOCAL_MARKETING" ] && [ -d "$LOCAL_MARKETING" ]; then
  dest="$LOCAL_MARKETING/public/install/github-deploy-key"
  mkdir -p "$(dirname "$dest")"
  install -m 600 "$SRC" "$dest"
  echo "==> Wrote $dest (run marketing sync / deploy to go live)"
  exit 0
fi

if [ "$VENDOR_HOST" = "localhost" ] || [ "$VENDOR_HOST" = "127.0.0.1" ]; then
  dest="$VENDOR_DIR/github-deploy-key"
  mkdir -p "$VENDOR_DIR"
  install -m 600 "$SRC" "$dest"
  echo "==> Wrote $dest"
  exit 0
fi

echo "==> Uploading to root@${VENDOR_HOST}:${VENDOR_DIR}/github-deploy-key"
ssh -o StrictHostKeyChecking=accept-new "root@${VENDOR_HOST}" "mkdir -p '$VENDOR_DIR'"
scp -o StrictHostKeyChecking=accept-new "$SRC" "root@${VENDOR_HOST}:${VENDOR_DIR}/github-deploy-key"
ssh -o StrictHostKeyChecking=accept-new "root@${VENDOR_HOST}" "chmod 600 '${VENDOR_DIR}/github-deploy-key'"
echo "==> Published. Customer panels will fetch on next update (ensure-fleet-deploy-key.sh)."
