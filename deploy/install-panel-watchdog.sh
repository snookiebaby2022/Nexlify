#!/usr/bin/env bash
# Install cron watchdog so panel 502 self-heals within ~2 minutes.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
CRON_FILE="/etc/cron.d/nexlify-panel-watchdog"
SCRIPT="$APP_DIR/deploy/panel-watchdog.sh"

chmod +x "$SCRIPT" "$APP_DIR/deploy/pm2-ensure-panel.sh"

cat > "$CRON_FILE" <<EOF
# Nexlify IPTV panel — auto-recover if :3000 stops (502 fix)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
*/2 * * * * root $SCRIPT
EOF
chmod 644 "$CRON_FILE"

echo "Installed $CRON_FILE (every 2 min)"
echo "Log: /var/log/nexlify-panel-watchdog.log"
