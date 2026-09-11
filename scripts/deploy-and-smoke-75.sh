#!/usr/bin/env bash
# Sync panel source to 75, build, restart, run smoke (run from dev machine with SSH key).
set -euo pipefail
HOST="${NEXLIFY_DEPLOY_HOST:-75.119.137.174}"
KEY="${NEXLIFY_SSH_KEY:-$HOME/.ssh/nexlify_deploy}"
REMOTE="${NEXLIFY_DEPLOY_USER:-root}@${HOST}"
REMOTE_DIR="${NEXLIFY_REMOTE_DIR:-/opt/nexlify-panel}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$REMOTE")
RSYNC=(rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new")

echo "=== Sync src + scripts to $REMOTE:$REMOTE_DIR ==="
"${RSYNC[@]}" \
  "$ROOT/src/" "$REMOTE:$REMOTE_DIR/src/" \
  "$ROOT/scripts/smoke-vpn-ssl-playback-75.sh" "$REMOTE:$REMOTE_DIR/scripts/"

echo "=== Build + restart on remote ==="
"${SSH[@]}" "cd '$REMOTE_DIR' && npm run build 2>&1 | tail -n 25 && (pm2 reload nexlify --update-env || pm2 restart nexlify --update-env) && sleep 2"

echo "=== Remote smoke ==="
"${SSH[@]}" "bash '$REMOTE_DIR/scripts/smoke-vpn-ssl-playback-75.sh'"
