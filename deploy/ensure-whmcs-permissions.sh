#!/bin/bash
# WHMCS file permissions — fixes update dry-run errors (e.g. License.php)
set -euo pipefail

WHMCS_ROOT="${WHMCS_ROOT:-/var/www/whmcs}"
WEB_USER="${WEB_USER:-www-data}"

echo "=== ensure-whmcs-permissions ($WHMCS_ROOT) ==="

[ -d "$WHMCS_ROOT" ] || { echo "WHMCS not found at $WHMCS_ROOT"; exit 1; }

chown -R "$WEB_USER:$WEB_USER" "$WHMCS_ROOT"
find "$WHMCS_ROOT" -type d -exec chmod 755 {} \;
find "$WHMCS_ROOT" -type f -exec chmod 644 {} \;

for f in admin/cron.php crons/cron.php; do
  [ -f "$WHMCS_ROOT/$f" ] && chmod 755 "$WHMCS_ROOT/$f"
done

for d in templates_c attachments downloads crons; do
  [ -d "$WHMCS_ROOT/$d" ] && chmod 775 "$WHMCS_ROOT/$d"
done

if [ -f "$WHMCS_ROOT/configuration.php" ]; then
  chown "$WEB_USER:$WEB_USER" "$WHMCS_ROOT/configuration.php"
  chmod 400 "$WHMCS_ROOT/configuration.php"
fi

bad=$(find "$WHMCS_ROOT" ! -user "$WEB_USER" 2>/dev/null | wc -l)
echo "Files not owned by $WEB_USER: $bad"
echo "ensure-whmcs-permissions done."
