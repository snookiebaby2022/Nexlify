#!/usr/bin/env bash
set -euo pipefail
apt-get update -qq
apt-get install -y -qq python3-pip ffmpeg curl
pip3 install --break-system-packages -q yt-dlp spotdl
command -v yt-dlp
yt-dlp --version | head -1
command -v spotdl || true
pm2 restart music-relay
echo "relay deps OK"
