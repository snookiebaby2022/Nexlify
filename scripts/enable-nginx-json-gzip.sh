#!/usr/bin/env bash
# Ensure nginx gzips application/json (XCIPTV / large Xtream payloads).
set -euo pipefail
CONF="${1:-/etc/nginx/nginx.conf}"
[ -f "$CONF" ] || exit 0
# Already configured (including multiline gzip_types blocks).
if grep -qE 'application/json' "$CONF" && grep -qE '^\s*gzip_vary\s+' "$CONF"; then
  echo "nginx gzip already configured for application/json"
  exit 0
fi
if grep -qE '^\s*gzip_types\s+.*application/json' "$CONF"; then
  echo "nginx gzip_types already includes application/json"
  exit 0
fi
# Uncomment common defaults and force application/json
if grep -qE '^\s*#\s*gzip_types' "$CONF"; then
  sed -i 's/^\s*#\s*gzip_types.*/\tgzip_types text\/plain text\/css application\/json application\/javascript text\/xml application\/xml application\/xml+rss text\/javascript;/' "$CONF"
elif grep -qE '^\s*gzip_types\s+' "$CONF"; then
  sed -i 's/^\(\s*gzip_types\s[^;]*\);/\1 application\/json;/' "$CONF"
else
  # Insert after gzip on;
  sed -i '/gzip on;/a\\tgzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;\n\tgzip_proxied any;\n\tgzip_vary on;' "$CONF"
fi
# Ensure gzip_proxied / vary are useful for reverse-proxied JSON
if ! grep -qE '^\s*gzip_proxied\s+' "$CONF"; then
  sed -i '/gzip on;/a\\tgzip_proxied any;' "$CONF"
fi
if ! grep -qE '^\s*gzip_vary\s+' "$CONF"; then
  sed -i '/gzip on;/a\\tgzip_vary on;' "$CONF"
fi
nginx -t && (systemctl reload nginx 2>/dev/null || service nginx reload 2>/dev/null || true)
echo "Enabled nginx gzip for application/json"
