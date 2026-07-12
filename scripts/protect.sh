#!/bin/bash
# Nexlify Panel Protection Script
# Prevents common issues: .next wipe, node_modules deletion, process crashes

set -euo pipefail

PANEL_DIR="/opt/nexlify-panel"
MARKETING_DIR="$PANEL_DIR/marketing-drop-in"
BACKUP_DIR="/var/backups/nexlify"
LOG="/var/log/nexlify-protection.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG"; }

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to backup critical directories
backup_critical() {
  log "Creating backups..."
  
  # Backup .next directories
  if [ -d "$PANEL_DIR/.next" ]; then
    tar -czf "$BACKUP_DIR/panel-next-$(date +%Y%m%d_%H%M%S).tar.gz" -C "$PANEL_DIR" .next 2>/dev/null || true
  fi
  
  if [ -d "$MARKETING_DIR/.next" ]; then
    tar -czf "$BACKUP_DIR/marketing-next-$(date +%Y%m%d_%H%M%S).tar.gz" -C "$MARKETING_DIR" .next 2>/dev/null || true
  fi
  
  # Keep only last 5 backups
  ls -t "$BACKUP_DIR"/panel-next-*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
  ls -t "$BACKUP_DIR"/marketing-next-*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true
  
  log "Backups created"
}

# Function to restore .next if missing
restore_next() {
  local dir="$1"
  local name="$2"
  
  if [ ! -f "$dir/.next/BUILD_ID" ]; then
    log "WARN: $name .next missing, attempting restore..."
    
    # Find latest backup
    local backup=$(ls -t "$BACKUP_DIR"/${name}-next-*.tar.gz 2>/dev/null | head -1)
    
    if [ -n "$backup" ]; then
      log "Restoring from: $backup"
      rm -rf "$dir/.next"
      tar -xzf "$backup" -C "$dir" 2>/dev/null
      log "Restored successfully"
      return 0
    else
      log "ERROR: No backup found for $name"
      return 1
    fi
  fi
  return 0
}

# Function to check and restart processes
check_processes() {
  log "Checking PM2 processes..."
  
  # Check if PM2 is running
  if ! pm2 list > /dev/null 2>&1; then
    log "ERROR: PM2 daemon not running, starting..."
    pm2 startup
    pm2 resurrect
  fi
  
  # Check each process
  for proc in nexlify nexlify-web nexlify-cron nexlify-license; do
    status=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  apps=json.load(sys.stdin)
  for a in apps:
    if a.get('name')=='$proc':
      print(a.get('pm2_env',{}).get('status','unknown'))
      sys.exit(0)
  print('not_found')
except: print('error')
" 2>/dev/null)
    
    if [ "$status" != "online" ]; then
      log "WARN: $proc is $status, restarting..."
      pm2 restart "$proc" 2>/dev/null || pm2 start "$proc" 2>/dev/null || true
      sleep 3
    fi
  done
  
  pm2 save > /dev/null 2>&1
  log "Processes checked"
}

# Function to validate Prisma schema
validate_prisma() {
  log "Validating Prisma schemas..."
  
  # Validate panel schema
  if [ -f "$PANEL_DIR/prisma/schema.prisma" ]; then
    if ! cd "$PANEL_DIR" && npx prisma validate > /dev/null 2>&1; then
      log "ERROR: Panel Prisma schema invalid"
      return 1
    fi
  fi
  
  # Validate marketing schema
  if [ -f "$MARKETING_DIR/prisma/schema.prisma" ]; then
    if ! cd "$MARKETING_DIR" && npx prisma validate > /dev/null 2>&1; then
      log "ERROR: Marketing Prisma schema invalid"
      return 1
    fi
  fi
  
  log "Prisma schemas valid"
}

# Function to check node_modules
check_node_modules() {
  log "Checking node_modules..."
  
  for dir in "$PANEL_DIR" "$MARKETING_DIR"; do
    if [ ! -d "$dir/node_modules" ]; then
      log "WARN: node_modules missing in $dir, installing..."
      cd "$dir" && npm install > /dev/null 2>&1
    fi
    
    # Check critical dependencies
    for dep in next react prisma; do
      if [ ! -d "$dir/node_modules/$dep" ]; then
        log "WARN: $dep missing in $dir, installing..."
        cd "$dir" && npm install > /dev/null 2>&1
        break
      fi
    done
  done
  
  log "node_modules checked"
}

# Main execution
case "${1:-all}" in
  backup)
    backup_critical
    ;;
  restore)
    restore_next "$PANEL_DIR" "panel"
    restore_next "$MARKETING_DIR" "marketing"
    ;;
  processes)
    check_processes
    ;;
  prisma)
    validate_prisma
    ;;
  deps)
    check_node_modules
    ;;
  all)
    log "=== Running full protection check ==="
    backup_critical
    restore_next "$PANEL_DIR" "panel"
    restore_next "$MARKETING_DIR" "marketing"
    check_node_modules
    validate_prisma
    check_processes
    log "=== Protection check complete ==="
    ;;
  *)
    echo "Usage: $0 {backup|restore|processes|prisma|deps|all}"
    exit 1
    ;;
esac
