#!/bin/bash
# Nexlify Panel — Safe sync script
# Syncs source code to a remote VPS without breaking node_modules or .next
#
# Usage: bash scripts/safe-sync.sh <user>@<host> <password>
#
# What it does:
# 1. Syncs src/, marketing-drop-in/src/, prisma/, ecosystem.config.cjs
# 2. Does NOT delete node_modules, .next, or .env on the target
# 3. Runs safe-rebuild.sh on the target after sync
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <user>@<host> [password]"
  exit 1
fi

TARGET="$1"
PASSWORD="${2:-}"
PANEL_DIR="/opt/nexlify-panel"

if [ -n "$PASSWORD" ]; then
  RSYNC_SSH="sshpass -p '$PASSWORD' ssh -o StrictHostKeyChecking=no"
  SSH_CMD="sshpass -p '$PASSWORD' ssh -o StrictHostKeyChecking=no $TARGET"
else
  RSYNC_SSH="ssh -o StrictHostKeyChecking=no"
  SSH_CMD="ssh -o StrictHostKeyChecking=no $TARGET"
fi

echo "=== Syncing source files to $TARGET ==="

# Sync panel source
rsync -avz -e "$RSYNC_SSH" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  --exclude='*.log' \
  /opt/nexlify-panel/src/ "$TARGET:$PANEL_DIR/src/"

# Sync marketing source
rsync -avz -e "$RSYNC_SSH" \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env' \
  /opt/nexlify-panel/marketing-drop-in/src/ "$TARGET:$PANEL_DIR/marketing-drop-in/src/"

# Sync config files
rsync -avz -e "$RSYNC_SSH" \
  /opt/nexlify-panel/ecosystem.config.cjs "$TARGET:$PANEL_DIR/ecosystem.config.cjs"

rsync -avz -e "$RSYNC_SSH" \
  /opt/nexlify-panel/prisma/ "$TARGET:$PANEL_DIR/prisma/"

echo "=== Sync complete ==="

echo "=== Running safe rebuild on $TARGET ==="
$SSH_CMD "bash $PANEL_DIR/scripts/safe-rebuild.sh"

echo "=== Done ==="
