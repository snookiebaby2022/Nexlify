#!/bin/bash
set -euo pipefail

CRON_LINE='*/5 * * * * /usr/bin/php -q /var/www/whmcs_private/crons/cron.php >> /var/log/whmcs-cron.log 2>&1'
MARKER='# nexlify-whmcs-cron'

cp /home/nexlify-panel/scripts/whmcs-cron-config.php /var/www/whmcs_private/crons/config.php
chown www-data:www-data /var/www/whmcs_private/crons/config.php
chmod 644 /var/www/whmcs_private/crons/config.php

touch /var/log/whmcs-cron.log
chown www-data:www-data /var/log/whmcs-cron.log

( crontab -l 2>/dev/null | grep -v "$MARKER" | grep -v 'whmcs_private/crons/cron.php' || true
  echo "$CRON_LINE $MARKER"
) | crontab -

/usr/bin/php -q /var/www/whmcs_private/crons/cron.php
echo "WHMCS cron ok"
