#!/usr/bin/env bash
# Shared guard: refuse panel restarts while a large SQL migration worker is active.
MIGRATE_LOCK_FILE="${MIGRATE_LOCK_FILE:-/tmp/nexlify-migrate-in-progress}"

nexlify_migrate_in_progress() {
  if [ ! -f "$MIGRATE_LOCK_FILE" ]; then
    return 1
  fi
  local age
  age=$(( $(date +%s) - $(stat -c %Y "$MIGRATE_LOCK_FILE" 2>/dev/null || echo 0) ))
  if [ "$age" -gt 7200 ]; then
    rm -f "$MIGRATE_LOCK_FILE"
    return 1
  fi
  # Also treat running background worker as in-progress
  if pgrep -f 'panel-migrate-background' >/dev/null 2>&1; then
    return 0
  fi
  return 0
}

nexlify_refuse_restart_if_migrating() {
  if nexlify_migrate_in_progress; then
    echo "REFUSING restart: SQL migration in progress ($MIGRATE_LOCK_FILE)." >&2
    echo "Wait for import/preview to finish, or remove the lock if it is stale." >&2
    return 1
  fi
  return 0
}
