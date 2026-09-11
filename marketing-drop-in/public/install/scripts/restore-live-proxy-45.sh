#!/usr/bin/env bash
# Back-compat wrapper — canonical script: scripts/restore-live-proxy.sh
exec bash "$(dirname "$0")/restore-live-proxy.sh" "$@"
