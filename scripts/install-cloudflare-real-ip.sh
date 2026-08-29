#!/usr/bin/env bash
# Trust Cloudflare's published proxy ranges so $remote_addr is the real viewer.
set -euo pipefail

OUT="${1:-/etc/nginx/conf.d/nexlify-cloudflare-realip.conf}"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "# Generated from Cloudflare's published proxy ranges."
  for url in https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6; do
    curl -fsSL --max-time 15 "$url" |
      while IFS= read -r cidr; do
        [ -n "$cidr" ] && printf 'set_real_ip_from %s;\n' "$cidr"
      done
  done
  echo "real_ip_header CF-Connecting-IP;"
  echo "real_ip_recursive on;"
} > "$TMP"

grep -q '^set_real_ip_from ' "$TMP"
grep -q '^real_ip_header CF-Connecting-IP;' "$TMP"
install -m 0644 "$TMP" "$OUT"
nginx -t
systemctl reload nginx 2>/dev/null || nginx -s reload
echo "CLOUDFLARE_REAL_IP_OK"
