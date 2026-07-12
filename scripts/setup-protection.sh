#!/bin/bash
# Setup Nexlify Panel Protection
# Deploys protection scripts and installs cron job

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VPS_HOST="${1:-root@85.17.162.54}"
PANEL_DIR="/opt/nexlify-panel"

echo "=== Setting up Nexlify Panel Protection ==="

# Check SSH connection
echo "Testing SSH connection to $VPS_HOST..."
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS_HOST" "echo 'Connected'" > /dev/null 2>&1; then
  echo "ERROR: Cannot connect to $VPS_HOST"
  echo "Please ensure SSH key authentication is set up or use: $0 user@host"
  exit 1
fi

# Create scripts directory on VPS
echo "Creating scripts directory..."
ssh "$VPS_HOST" "mkdir -p $PANEL_DIR/scripts"

# Copy protection scripts
echo "Copying protection scripts..."
scp "$SCRIPT_DIR/protect.sh" "$VPS_HOST:$PANEL_DIR/scripts/"
scp "$SCRIPT_DIR/safe-rsync.sh" "$VPS_HOST:$PANEL_DIR/scripts/"

# Make scripts executable
echo "Making scripts executable..."
ssh "$VPS_HOST" "chmod +x $PANEL_DIR/scripts/protect.sh $PANEL_DIR/scripts/safe-rsync.sh"

# Install cron job
echo "Installing cron job..."
ssh "$VPS_HOST" "cat > /etc/cron.d/nexlify-protection" < "$SCRIPT_DIR/nexlify-protection.cron"
ssh "$VPS_HOST" "chmod 644 /etc/cron.d/nexlify-protection"

# Create log directory
echo "Creating log directory..."
ssh "$VPS_HOST" "mkdir -p /var/log && touch /var/log/nexlify-protection.log"

# Run initial protection check
echo "Running initial protection check..."
ssh "$VPS_HOST" "bash $PANEL_DIR/scripts/protect.sh all"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Protection is now active:"
echo "  • Full check runs every 5 minutes"
echo "  • Backups created every hour"
echo "  • Logs: /var/log/nexlify-protection.log"
echo ""
echo "Manual commands:"
echo "  • Full check:    bash $PANEL_DIR/scripts/protect.sh all"
echo "  • Create backup: bash $PANEL_DIR/scripts/protect.sh backup"
echo "  • Restore .next: bash $PANEL_DIR/scripts/protect.sh restore"
echo "  • Check procs:   bash $PANEL_DIR/scripts/protect.sh processes"
echo ""
echo "Safe rsync usage:"
echo "  • bash $PANEL_DIR/scripts/safe-rsync.sh source/ dest/"
echo ""
