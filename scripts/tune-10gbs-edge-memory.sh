#!/usr/bin/env bash
# Lower edge RAM on stream server (10gbs): fan map, HLS seg cache, upstream sockets.
set -euo pipefail
cd /opt/nexlify-panel

node scripts/tune-10gbs-edge-memory.cjs
