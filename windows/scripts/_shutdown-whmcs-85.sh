#!/usr/bin/env bash
# Disable public WHMCS (billing.nexlify.live) on vendor 85. Keeps files for recovery.
set -euo pipefail

TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/root/whmcs-shutdown-$TS"
mkdir -p "$BACKUP_DIR"

echo "==> Backup nginx configs to $BACKUP_DIR"
cp -a /etc/nginx/sites-available/billing.nexlify.live "$BACKUP_DIR/" 2>/dev/null || true
cp -a /etc/nginx/sites-enabled/billing.nexlify.live "$BACKUP_DIR/" 2>/dev/null || true
cp -a /etc/nginx/sites-enabled/valuescan-whmcs-bridge.conf "$BACKUP_DIR/" 2>/dev/null || true
cp -a /etc/nginx/sites-available/valuescan-whmcs-bridge.conf "$BACKUP_DIR/" 2>/dev/null || true

echo "==> Disable public billing.nexlify.live"
rm -f /etc/nginx/sites-enabled/billing.nexlify.live

# Keep a parked vhost so TLS/DNS still resolve to a clear "retired" page
cat >/etc/nginx/sites-available/billing.nexlify.live.parked <<'NGINX'
# Parked — WHMCS shut down (files remain at /var/www/whmcs)
server {
    listen 80;
    listen [::]:80;
    server_name billing.nexlify.live;
    return 301 https://nexlify.live/pricing;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name billing.nexlify.live;

    ssl_certificate     /etc/letsencrypt/live/billing.nexlify.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/billing.nexlify.live/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://nexlify.live/pricing;
}
NGINX

ln -sfn /etc/nginx/sites-available/billing.nexlify.live.parked /etc/nginx/sites-enabled/billing.nexlify.live.parked

echo "==> Disable local valuescan WHMCS bridge (9187)"
rm -f /etc/nginx/sites-enabled/valuescan-whmcs-bridge.conf

echo "==> Disable WHMCS cron jobs"
# root crontab
if crontab -l >/tmp/root-cron.bak 2>/dev/null; then
  cp /tmp/root-cron.bak "$BACKUP_DIR/root-crontab.bak"
  grep -vi whmcs /tmp/root-cron.bak >/tmp/root-cron.new || true
  crontab /tmp/root-cron.new
fi
# www-data crontab
if crontab -u www-data -l >/tmp/www-cron.bak 2>/dev/null; then
  cp /tmp/www-cron.bak "$BACKUP_DIR/www-data-crontab.bak"
  grep -vi whmcs /tmp/www-cron.bak >/tmp/www-cron.new || true
  crontab -u www-data /tmp/www-cron.new
fi
# /etc/cron.d entries
for f in /etc/cron.d/*; do
  [ -f "$f" ] || continue
  if grep -qi whmcs "$f" 2>/dev/null; then
    cp -a "$f" "$BACKUP_DIR/"
    mv "$f" "${f}.disabled-whmcs-$TS"
    echo "disabled $f"
  fi
done
# WHMCS built-in cron wrapper if present
if [ -f /var/www/whmcs/crons/cron.php ]; then
  touch /var/www/whmcs/crons/.nexlify-whmcs-disabled
fi

echo "==> nginx test + reload"
nginx -t
systemctl reload nginx

echo "==> Verify"
curl -sS -o /dev/null -w "billing_http:%{http_code} redirect:%{redirect_url}\n" -L --max-redirs 0 http://127.0.0.1/ -H "Host: billing.nexlify.live" || true
curl -sS -o /dev/null -w "billing_https:%{http_code} redirect:%{redirect_url}\n" -k -L --max-redirs 0 https://127.0.0.1/ -H "Host: billing.nexlify.live" || true
ss -lntp | grep 9187 || echo "9187_closed"
ls -la /etc/nginx/sites-enabled/ | grep -Ei "billing|whmcs" || true

echo "WHMCS_SHUTDOWN_OK backup=$BACKUP_DIR"
echo "Files kept at /var/www/whmcs (not deleted). Cancel WHMCS license with WHMCS Inc if still billed."
