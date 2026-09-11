#!/usr/bin/env bash
# Deprecated name — use sync-panel-host.sh with env vars (works for any install).
exec env \
  SOURCE_HOST="${SOURCE_HOST:-${PANEL_45_HOST:-root@45.88.138.18}}" \
  TARGET_HOST="${TARGET_HOST:-${PANEL_75_HOST:-root@75.119.137.174}}" \
  bash "$(dirname "$0")/sync-panel-host.sh"
