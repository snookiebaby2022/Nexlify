#!/usr/bin/env bash
# Shared timestamped logging for Nexlify cron/ops scripts (source from bash).
# Usage: source "$(dirname "$0")/../lib/nexlify-log.sh"  # from scripts/*.sh
#        nexlify_log "message with details key=value"

nexlify_log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

nexlify_log_err() {
  printf '[%s] ERROR %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}
