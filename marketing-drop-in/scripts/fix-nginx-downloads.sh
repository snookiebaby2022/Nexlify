#!/usr/bin/env bash
# Ensure nexlify.live serves /downloads/ from disk (panel tarball).
# Run on VPS as root: bash /var/www/nexlify/scripts/fix-nginx-downloads.sh

set -euo pipefail

CONF=""
for f in /etc/nginx/sites-enabled/nexlify.live.conf \
         /etc/nginx/sites-enabled/nexlify.live \
         /etc/nginx/conf.d/nexlify.live.conf; do
  [ -f "$f" ] && CONF="$f" && break
done

if [ -z "$CONF" ]; then
  echo "ERROR: nexlify.live nginx config not found under sites-enabled or conf.d"
  exit 1
fi

if grep -q 'location /downloads/' "$CONF"; then
  echo "OK: location /downloads/ already in $CONF"
else
  echo "Adding location /downloads/ to $CONF ..."
  cp "$CONF" "${CONF}.bak.$(date +%s)"
  awk '
    /server_name.*nexlify\.live/ { in_server=1 }
    in_server && /location \/ \{/ && !done {
      print "    location /downloads/ {"
      print "        alias /var/www/nexlify/public/downloads/;"
      print "        add_header Cache-Control \"no-store, must-revalidate\";"
      print "        add_header CDN-Cache-Control \"no-store\";"
      print "        default_type application/octet-stream;"
      print "    }"
      print ""
      done=1
    }
    { print }
  ' "$CONF" > "${CONF}.tmp"
  mv "${CONF}.tmp" "$CONF"
  echo "Patched $CONF"
fi

mkdir -p /var/www/nexlify/public/downloads
nginx -t
systemctl reload nginx

echo ""
echo "Verify:"
echo "  ls -la /var/www/nexlify/public/downloads/nexlify-panel.tar.gz"
echo "  curl -sI http://127.0.0.1:13001/downloads/nexlify-panel.tar.gz | head -1"
echo "  curl -sIk https://127.0.0.1/downloads/nexlify-panel.tar.gz -H 'Host: nexlify.live' | head -1"
