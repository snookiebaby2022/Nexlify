#!/usr/bin/env bash
# Install weekly VPS backup cron + env template on the Nexlify VPS.
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/var/www/nexlify/deploy}"
BACKUP_SCRIPT="$DEPLOY_ROOT/vps-full-backup.sh"
ENV_FILE="/root/.nexlify-backup.env"
CRON_LINE="0 4 * * 0 root $BACKUP_SCRIPT >> /var/log/nexlify-backup.log 2>&1"

chmod +x "$BACKUP_SCRIPT"

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# cPanel FTP for https://snookiebaby.site/nexlify/backups/
# Get credentials from cPanel → FTP Accounts (or main account FTP).
CPANEL_FTP_HOST=snookiebaby.site
CPANEL_FTP_PORT=21
CPANEL_FTP_USER=
CPANEL_FTP_PASS=
# Path relative to FTP home (usually public_html/nexlify/backups)
CPANEL_FTP_PATH=public_html/nexlify/backups
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE — fill in CPANEL_FTP_USER and CPANEL_FTP_PASS"
fi

mkdir -p /var/backups/nexlify
touch /var/log/nexlify-backup.log

CRON_FILE="/etc/cron.d/nexlify-vps-backup"
echo "$CRON_LINE" > "$CRON_FILE"
chmod 644 "$CRON_FILE"
echo "Installed weekly cron (Sundays 04:00 UTC): $CRON_FILE"

apt-get update -qq
apt-get install -y -qq lftp postgresql-client sqlite3 jq 2>/dev/null || true

echo "Done. Test manually: $BACKUP_SCRIPT"
