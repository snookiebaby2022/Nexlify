#!/bin/bash
# Nexlify Marketing Website — Safe deploy script
# Deploys marketing site changes without breaking the build
#
# Usage: bash scripts/deploy-marketing.sh [user@host] [password]
#
# Without arguments: rebuilds and restarts locally
# With arguments: syncs source to remote, then rebuilds and restarts there
set -euo pipefail

MARKETING_DIR="/opt/nexlify-panel/marketing-drop-in"
PANEL_DIR="/opt/nexlify-panel"
REMOTE=""
PASSWORD=""

if [ $# -ge 1 ]; then
  REMOTE="$1"
  PASSWORD="${2:-}"
fi

cd "$PANEL_DIR"

# === Remote sync ===
if [ -n "$REMOTE" ]; then
  echo "=== Syncing marketing source to $REMOTE ==="

  SSH_OPTS="-o StrictHostKeyChecking=no -o ServerAliveInterval=60"
  if [ -n "$PASSWORD" ]; then
    RSYNC_SSH="sshpass -p '$PASSWORD' ssh $SSH_OPTS"
    SSH_CMD="sshpass -p '$PASSWORD' ssh $SSH_OPTS $REMOTE"
  else
    RSYNC_SSH="ssh $SSH_OPTS"
    SSH_CMD="ssh $SSH_OPTS $REMOTE"
  fi

  # Sync marketing source ONLY — never touch node_modules, .next, prisma, .env
  rsync -avz -e "$RSYNC_SSH" \
    --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.env' \
    --exclude='prisma/migrations' \
    "$MARKETING_DIR/src/" "$REMOTE:$MARKETING_DIR/src/"

  # Sync marketing package.json and package-lock.json (needed for npm install)
  rsync -avz -e "$RSYNC_SSH" \
    "$MARKETING_DIR/package.json" "$REMOTE:$MARKETING_DIR/package.json"
  rsync -avz -e "$RSYNC_SSH" \
    "$MARKETING_DIR/package-lock.json" "$REMOTE:$MARKETING_DIR/package-lock.json" 2>/dev/null || true

  echo "=== Sync complete, rebuilding on remote ==="
  $SSH_CMD "bash $MARKETING_DIR/scripts/deploy-marketing.sh"
  echo "=== Remote deploy done ==="
  exit 0
fi

# === Local rebuild ===
echo "=== Step 1: Check node_modules ==="
MISSING=0
for dep in tailwindcss next react prisma; do
  if [ ! -d "$MARKETING_DIR/node_modules/$dep" ]; then
    echo "  MISSING: $dep"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  echo "  Installing missing dependencies..."
  cd "$MARKETING_DIR"
  npm install 2>&1 | tail -5
  cd "$PANEL_DIR"
else
  echo "  All critical dependencies present"
fi

echo ""
echo "=== Step 2: Prisma generate (marketing schema) ==="
cd "$MARKETING_DIR"
npx prisma generate 2>&1 | tail -3
cd "$PANEL_DIR"
echo "  Done"

echo ""
echo "=== Step 3: Build marketing site ==="
cd "$MARKETING_DIR"
npm run build 2>&1 | tail -10
if [ ! -f ".next/BUILD_ID" ]; then
  echo "  ERROR: Build failed — no BUILD_ID"
  exit 1
fi
echo "  Build succeeded: $(cat .next/BUILD_ID)"
cd "$PANEL_DIR"

echo ""
echo "=== Step 4: Restart nexlify-web ==="
pm2 restart nexlify-web --update-env 2>&1 | grep -E 'status|name' | head -5
sleep 3
pm2 logs nexlify-web --lines 3 --nostream 2>&1 | grep -E 'Ready|error' | tail -3
pm2 save 2>&1 | tail -1
echo "  Done"

echo ""
echo "=== Marketing deploy complete ==="
