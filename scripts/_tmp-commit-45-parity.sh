#!/bin/bash
set -euo pipefail
cd /c/Users/lizzi/nexlify-panel
git commit -m "$(cat <<'EOF'
Ship 45 production playback and Xtream login fixes so GitHub matches the live panel.

Keep Live-only streams from flipping to Direct, return XUI-style auth:0 for empty player_api probes so LG Smarters Pro can log in, and serve real HLS to Smart TVs instead of MPEG-TS.

EOF
)"
git log -1 --oneline
git status --short | head -20
