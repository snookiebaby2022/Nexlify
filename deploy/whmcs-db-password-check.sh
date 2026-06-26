#!/bin/bash
set -euo pipefail
if [ -f /var/www/whmcs/configuration.php ]; then
  echo "configuration.php exists — DB password stored there (WHMCS admin only)."
  php -r 'include "/var/www/whmcs/configuration.php"; echo "db_user=$db_username\n";'
else
  echo "No configuration.php yet (installer not finished)."
fi
mysql -e "SELECT user, host FROM mysql.user WHERE user='whmcs';"
