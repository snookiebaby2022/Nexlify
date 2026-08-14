#!/usr/bin/env bash
# Back-compat: this filename used to pin marketing at v1.9.35. It now deploys
# the current GitHub main feed so Admin → Updates is not stuck on an old version.
set -euo pipefail
if [ -f "$(cd "$(dirname "$0")" && pwd)/update-marketing-on-vps.sh" ]; then
  exec bash "$(cd "$(dirname "$0")" && pwd)/update-marketing-on-vps.sh" "$@"
fi
curl -fsSL 'https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/update-marketing-on-vps.sh' | bash
