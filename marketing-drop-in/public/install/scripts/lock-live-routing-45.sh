#!/usr/bin/env bash
# Back-compat wrapper — canonical script: scripts/lock-live-routing.sh
exec bash "$(dirname "$0")/lock-live-routing.sh" "$@"
