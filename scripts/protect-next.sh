#!/bin/bash
# Nexlify Panel — .next Directory Backup/Restore
# Backs up .next directories before rsync, restores after
#
# Usage:
#   Before rsync:  bash scripts/protect-next.sh backup
#   After rsync:   bash scripts/protect-next.sh restore
#   Full cycle:    bash scripts/protect-next.sh cycle
set -euo pipefail

PANEL_DIR="/opt/nexlify-panel"
MARKETING_DIR="$PANEL_DIR/marketing-drop-in"
BACKUP_DIR="/var/backups/nexlify-next"
LOG="/var/log/nexlify-next-backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

backup_next() {
  local dir="$1"
  local name="$2"
  if [ -d "$dir/.next" ]; then
    local backup="$BACKUP_DIR/$name-$(date +%Y%m%d_%H%M%S).tar.gz"
    mkdir -p "$BACKUP_DIR"
    tar -czf "$backup" -C "$dir" .next 2>/dev/null
    log "Backed up $name .next to $backup"
    # Keep only last 3 backups
    ls -t "$BACKUP_DIR/$name-"*.tar.gz 2>/dev/null | tail -n +4 | xargs rm -f 2>/dev/null
  else
    log "WARN: $name .next not found — skipping backup"
  fi
}

restore_next() {
  local dir="$1"
  local name="$2"
  local backup
  backup=$(ls -t "$BACKUP_DIR/$name-"*.tar.gz 2>/dev/null | head -1)
  if [ -n "$backup" ]; then
    mkdir -p "$dir/.next"
    tar -xzf "$backup" -C "$dir" 2>/dev/null
    log "Restored $name .next from $backup"
  else
    log "WARN: No backup found for $name — will need to rebuild"
  fi
}

case "${1:-cycle}" in
  backup)
    backup_next "$PANEL_DIR" "panel"
    backup_next "$MARKETING_DIR" "marketing"
    ;;
  restore)
    restore_next "$PANEL_DIR" "panel"
    restore_next "$MARKETING_DIR" "marketing"
    ;;
  cycle)
    backup_next "$PANEL_DIR" "panel"
    backup_next "$MARKETING_DIR" "marketing"
    echo "Backups saved. After rsync, run: bash scripts/protect-next.sh restore"
    ;;
  *)
    echo "Usage: $0 {backup|restore|cycle}"
    exit 1
    ;;
esac
