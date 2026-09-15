#!/bin/bash
# Install/start Redis on an edge LB and wire REDIS_* into .env, then restart nexlify-iptv-edge.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v redis-server >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq redis-server
fi
systemctl enable redis-server 2>/dev/null || systemctl enable redis 2>/dev/null || true
systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true
sleep 1
redis-cli ping
redis-cli CONFIG SET maxmemory-policy noeviction || true
redis-cli CONFIG REWRITE 2>/dev/null || true

ENVF=/opt/nexlify-panel/.env
touch "$ENVF"
set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENVF"; then sed -i "s|^${k}=.*|${k}=${v}|" "$ENVF"
  else printf '%s=%s\n' "$k" "$v" >> "$ENVF"; fi
}
set_kv REDIS_URL 'redis://127.0.0.1:6379'
set_kv REDIS_SLOTS_URL 'redis://127.0.0.1:6379'
set_kv IPTV_EDGE_HTTP_PORTS '80,8080,25461'
set_kv IPTV_EDGE_HTTPS_PORTS '443'
set_kv IPTV_EDGE_CERT '/etc/nginx/ssl/nexlify-panel/fullchain.pem'
set_kv IPTV_EDGE_KEY '/etc/nginx/ssl/nexlify-panel/privkey.pem'
set_kv IPTV_EDGE_REMOTE_NODE '1'
grep -q '^IPTV_EDGE_BACKEND=' "$ENVF" || set_kv IPTV_EDGE_BACKEND '45.88.138.18:80'

set -a
# shellcheck disable=SC1090
. "$ENVF"
set +a

pm2 delete nexlify-iptv-edge 2>/dev/null || true
pm2 start /opt/nexlify-panel/scripts/iptv-edge-proxy.mjs --name nexlify-iptv-edge
pm2 save
sleep 3
echo '=== listeners ==='
ss -lntp | grep -E ':80|:443|:8080|:25461|:6379' || true
echo '=== redis policy ==='
redis-cli INFO memory | grep maxmemory_policy || true
echo '=== health ==='
for u in http://127.0.0.1/edge/health http://127.0.0.1:8080/edge/health http://127.0.0.1:25461/edge/health; do
  curl -sS -m 3 -o /dev/null -w "$u %{http_code}\n" "$u"
done
curl -skS -m 3 -o /dev/null -w "https://127.0.0.1/edge/health %{http_code}\n" https://127.0.0.1/edge/health
echo REDIS_EDGE_OK
