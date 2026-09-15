#!/bin/bash
# Remote body for scripts/fix-all-servers-ports.cjs — run on LB/edge nodes only.
# Makes nexlify-iptv-edge own 80/8080/25461 (+443 when certs exist), Redis sane, XUI off those ports.
set -euo pipefail

PANEL=/opt/nexlify-panel
cd "$PANEL" || { echo 'NO_PANEL_DIR'; exit 2; }

echo '=== BEFORE listeners ==='
ss -lntp | grep -E ':80|:443|:8080|:25461|:6379|:18080|:18443' || true

echo '=== companion modules ==='
ls -la scripts/iptv-edge-proxy.mjs scripts/edge-redis-slots.mjs scripts/edge-redis-auth.mjs 2>&1 || true

echo '=== disable xuione / reclaim media ports ==='
if systemctl cat xuione.service >/dev/null 2>&1; then
  systemctl disable --now xuione.service 2>/dev/null || true
fi
for pat in '/home/xui/bin/nginx/sbin/nginx' '/home/xui/bin/nginx_rtmp/sbin/nginx_rtmp'; do
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  if [ -n "${pids:-}" ]; then
    # shellcheck disable=SC2086
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -KILL $pids 2>/dev/null || true
  fi
done

reclaim_xui() {
  local port="$1" line pid cmd
  while read -r line; do
    [ -z "$line" ] && continue
    pid=$(echo "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
    [ -z "$pid" ] && continue
    cmd=$(tr '\0' ' ' < /proc/"$pid"/cmdline 2>/dev/null || true)
    case "$cmd" in
      */home/xui/bin/nginx*|*/home/xui/bin/nginx_rtmp*)
        echo "killing xui on :$port pid=$pid"
        kill -TERM "$pid" 2>/dev/null || true
        sleep 1
        kill -KILL "$pid" 2>/dev/null || true
        ;;
    esac
  done < <(ss -lntp 2>/dev/null | grep -E ":${port}\\b" || true)
}
for port in 80 443 8080 25461; do reclaim_xui "$port"; done

HTTP_CONF=/home/xui/bin/nginx/conf/ports/http.conf
HTTPS_CONF=/home/xui/bin/nginx/conf/ports/https.conf
TS=$(date +%Y%m%d%H%M%S)
if [ -f "$HTTP_CONF" ] && ! grep -qx 'listen 18080;' "$HTTP_CONF" 2>/dev/null; then
  cp -a "$HTTP_CONF" "${HTTP_CONF}.bak-nexlify-${TS}"
  printf '%s\n' 'listen 18080;' > "$HTTP_CONF"
  echo "rewrote $HTTP_CONF -> 18080"
fi
if [ -f "$HTTPS_CONF" ] && ! grep -qx 'listen 18443 ssl;' "$HTTPS_CONF" 2>/dev/null; then
  cp -a "$HTTPS_CONF" "${HTTPS_CONF}.bak-nexlify-${TS}"
  printf '%s\n' 'listen 18443 ssl;' > "$HTTPS_CONF"
  echo "rewrote $HTTPS_CONF -> 18443"
fi

ENVF="$PANEL/.env"
touch "$ENVF"
set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENVF" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENVF"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENVF"
  fi
}

set_kv IPTV_EDGE_HTTP_PORTS '80,8080,25461'
set_kv IPTV_EDGE_REMOTE_NODE '1'
if ! grep -q '^IPTV_EDGE_BACKEND=' "$ENVF" 2>/dev/null; then
  set_kv IPTV_EDGE_BACKEND '45.88.138.18:80'
fi

CERT=""
KEY=""
if [ -f /etc/nginx/ssl/nexlify-panel/fullchain.pem ] && [ -f /etc/nginx/ssl/nexlify-panel/privkey.pem ]; then
  CERT=/etc/nginx/ssl/nexlify-panel/fullchain.pem
  KEY=/etc/nginx/ssl/nexlify-panel/privkey.pem
elif [ -d /etc/letsencrypt/live ]; then
  for d in /etc/letsencrypt/live/*; do
    [ -f "$d/fullchain.pem" ] && [ -f "$d/privkey.pem" ] || continue
    CERT="$d/fullchain.pem"
    KEY="$d/privkey.pem"
    break
  done
elif [ -f /opt/nexlify-panel/ssl/fullchain.pem ] && [ -f /opt/nexlify-panel/ssl/privkey.pem ]; then
  CERT=/opt/nexlify-panel/ssl/fullchain.pem
  KEY=/opt/nexlify-panel/ssl/privkey.pem
fi
echo "TLS_CERT=${CERT:-none}"
echo "TLS_KEY=${KEY:-none}"

if [ -n "$CERT" ] && [ -n "$KEY" ]; then
  set_kv IPTV_EDGE_HTTPS_PORTS '443'
  set_kv IPTV_EDGE_CERT "$CERT"
  set_kv IPTV_EDGE_KEY "$KEY"
  if ss -lntp | grep -qE ':443\b.*nginx'; then
    echo 'releasing nginx :443 for edge TLS'
    for f in /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/*; do
      [ -f "$f" ] || continue
      if grep -qE 'listen[[:space:]]+(\[::\]:)?443' "$f" 2>/dev/null; then
        cp -a "$f" "${f}.bak-edge443-${TS}" || true
        sed -i -E 's/^([[:space:]]*listen[[:space:]]+(\[::\]:)?443)/# nexlify-edge-claim \1/' "$f" || true
      fi
    done
    if nginx -t 2>/dev/null; then
      systemctl reload nginx 2>/dev/null || true
    fi
    reclaim_xui 443
  fi
else
  set_kv IPTV_EDGE_HTTPS_PORTS ''
  echo 'NO_TLS_CERTS — HTTPS :443 skipped (generate certs then re-run)'
fi

# Local Redis for edge auth cache + slot admit (panel live-auth remains source of truth)
export DEBIAN_FRONTEND=noninteractive
if ! command -v redis-server >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq redis-server
fi
systemctl enable redis-server 2>/dev/null || systemctl enable redis 2>/dev/null || true
systemctl start redis-server 2>/dev/null || systemctl start redis 2>/dev/null || true
sleep 1
if redis-cli ping 2>/dev/null | grep -q PONG; then
  set_kv REDIS_URL 'redis://127.0.0.1:6379'
  set_kv REDIS_SLOTS_URL 'redis://127.0.0.1:6379'
  redis-cli CONFIG SET maxmemory-policy noeviction 2>/dev/null || true
  redis-cli CONFIG REWRITE 2>/dev/null || true
  echo "redis: $(redis-cli INFO memory 2>/dev/null | grep -E 'maxmemory_policy|used_memory_human' | tr '\n' ' ')"
else
  echo 'WARN: redis install/start failed — edge slots unavailable (panel live-auth still enforces)'
fi

# Load env into this shell for pm2 start
set -a
# shellcheck disable=SC1090
. "$ENVF"
set +a

export IPTV_EDGE_HTTP_PORTS="${IPTV_EDGE_HTTP_PORTS:-80,8080,25461}"
export IPTV_EDGE_HTTPS_PORTS="${IPTV_EDGE_HTTPS_PORTS:-}"
export IPTV_EDGE_CERT="${IPTV_EDGE_CERT:-}"
export IPTV_EDGE_KEY="${IPTV_EDGE_KEY:-}"
export IPTV_EDGE_BACKEND="${IPTV_EDGE_BACKEND:-45.88.138.18:80}"
export IPTV_EDGE_REMOTE_NODE=1

if [ ! -f scripts/iptv-edge-proxy.mjs ]; then
  echo 'NO_EDGE_PROXY'; exit 3
fi
if [ ! -f scripts/edge-redis-slots.mjs ]; then
  echo 'NO_EDGE_SLOTS_MODULE'; exit 4
fi

edge_player_api_ok() {
  curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/player_api.php 2>/dev/null | grep -qE '200|401|403'
}

start_edge_pm2() {
  env IPTV_EDGE_HTTP_PORTS="$IPTV_EDGE_HTTP_PORTS" \
      IPTV_EDGE_HTTPS_PORTS="$IPTV_EDGE_HTTPS_PORTS" \
      IPTV_EDGE_CERT="$IPTV_EDGE_CERT" \
      IPTV_EDGE_KEY="$IPTV_EDGE_KEY" \
      IPTV_EDGE_BACKEND="$IPTV_EDGE_BACKEND" \
      IPTV_EDGE_REMOTE_NODE=1 \
      REDIS_URL="${REDIS_URL:-}" \
      REDIS_SLOTS_URL="${REDIS_SLOTS_URL:-}" \
      PANEL_INTERNAL_SECRET="${PANEL_INTERNAL_SECRET:-}" \
    pm2 start scripts/iptv-edge-proxy.mjs --name nexlify-iptv-edge --cwd "$PANEL" --interpreter node --update-env --max-memory-restart 8192M
}

ensure_edge_fallback() {
  if [ -x "$PANEL/scripts/ensure-iptv-edge-pm2.sh" ]; then
    echo '=== ensure-iptv-edge fallback ==='
    bash "$PANEL/scripts/ensure-iptv-edge-pm2.sh" || return 1
    return 0
  fi
  return 1
}

# Single delete + start — never leave edge stopped between two deletes
pm2 delete nexlify-iptv-edge 2>/dev/null || true
if ! start_edge_pm2; then
  echo 'WARN: pm2 start failed'
  ensure_edge_fallback || { echo 'EDGE_START_FAILED'; exit 5; }
elif ! edge_player_api_ok; then
  echo 'WARN: edge up but player_api unhealthy — ensure fallback'
  ensure_edge_fallback || true
fi
pm2 save || true
sleep 4
if ! edge_player_api_ok; then
  echo 'ERROR: player_api still unhealthy after port fix'
  ensure_edge_fallback || exit 6
fi

echo '=== AFTER listeners ==='
ss -lntp | grep -E ':80|:443|:8080|:25461|:6379' || true

echo '=== health ==='
for u in \
  'http://127.0.0.1/edge/health' \
  'http://127.0.0.1:8080/edge/health' \
  'http://127.0.0.1:25461/edge/health'
do
  code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$u" || echo FAIL)
  echo "$u -> $code"
done
if [ -n "${IPTV_EDGE_HTTPS_PORTS:-}" ]; then
  code=$(curl -skS -m 5 -o /dev/null -w '%{http_code}' https://127.0.0.1/edge/health || echo FAIL)
  echo "https://127.0.0.1/edge/health -> $code"
fi

echo '=== recent errors ==='
tail -20 /root/.pm2/logs/nexlify-iptv-edge-error.log 2>/dev/null || true
pm2 describe nexlify-iptv-edge 2>/dev/null | head -45 || true
echo 'EDGE_PORT_FIX_DONE'
