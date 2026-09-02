#!/bin/bash
set -euo pipefail
cd /home/nexlify-panel
git fetch origin main
git reset --hard origin/main
git log -1 --oneline
grep -n MIN_HEALTHY_PULSE_BYTES src/lib/connection-quality-live.ts | head -3
grep -n xtreamUnauthPayload src/app/player_api.php/route.ts | head -3
bash scripts/publish-panel-release.sh
echo PUBLISH_OK
ls -l /var/www/nexlify/public/downloads/nexlify-panel.tar.gz
tar -xOf /var/www/nexlify/public/downloads/nexlify-panel.tar.gz --wildcards '*/src/lib/connection-quality-live.ts' | grep -c MIN_HEALTHY_PULSE_BYTES
curl -sS -o /dev/null -w 'tar:%{http_code} size:%{size_download}\n' --max-time 15 https://nexlify.live/downloads/nexlify-panel.tar.gz
curl -sS -o /dev/null -w 'installer:%{http_code}\n' --max-time 15 'https://nexlify.live/install/panel.sh?v=2.0.62'
