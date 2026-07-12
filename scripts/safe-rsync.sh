#!/bin/bash
# Safe Rsync Wrapper for Nexlify Panel
# Automatically protects .next and node_modules during sync

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTECT_SCRIPT="$SCRIPT_DIR/protect.sh"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

# Check if protect script exists
if [ ! -f "$PROTECT_SCRIPT" ]; then
  log "ERROR: protect.sh not found at $PROTECT_SCRIPT"
  exit 1
fi

# Create backup before sync
log "Creating pre-sync backup..."
bash "$PROTECT_SCRIPT" backup

# Run rsync with exclusions
log "Running rsync..."
rsync -avz --progress \
  --exclude='.next' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='*.log' \
  --exclude='tmp_*' \
  --exclude='.git' \
  "$@"

# Verify .next directories exist
log "Verifying .next directories..."
bash "$PROTECT_SCRIPT" restore

# Check node_modules
log "Verifying dependencies..."
bash "$PROTECT_SCRIPT" deps

# Restart processes
log "Restarting processes..."
bash "$PROTECT_SCRIPT" processes

log "=== Safe rsync complete ==="
