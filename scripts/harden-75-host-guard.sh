#!/usr/bin/env bash
# Abort unless running on server 75 (75.119.137.174).
set -euo pipefail
HOST=$(hostname -I | awk '{print $1}')
if [ "$HOST" != "75.119.137.174" ]; then
  echo "ABORT: hardening scripts may only run on 75.119.137.174 (got $HOST)" >&2
  exit 1
fi
