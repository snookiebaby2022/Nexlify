#!/usr/bin/env bash
# Finish server 75 deploy: sync, build, restart, fixture, pre-reboot verify.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/harden-75-host-guard.sh"
PANEL="${PANEL_ROOT:-/opt/nexlify-panel}"
cd "$PANEL"

git fetch origin main
git reset --hard origin/main
sed -i 's/\r$//' scripts/*.sh scripts/*.mjs ecosystem.config.cjs src/lib/*.ts 2>/dev/null || true
chmod +x scripts/*.sh
rm -f /tmp/nexlify-panel-build.lock .update-progress.json .update-progress.pid

npx prisma generate
bash scripts/rebuild-panel-safe.sh
bash scripts/ensure-panel-env.sh 2>/dev/null || true
bash scripts/panel-restart-safe.sh --nexlify-only
pm2 restart nexlify-cron --update-env 2>/dev/null || true
pm2 restart nexlify-iptv-edge --update-env 2>/dev/null || true
pm2 save

curl -fsS -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1:13000/api/health
ss -lntp | grep ':8787' && echo WARN_license || echo license_closed

bash scripts/harden-75-playback-fixture.sh
SKIP_REBOOT=1 bash scripts/harden-75-reboot-proof.sh

echo finish_75_ok
