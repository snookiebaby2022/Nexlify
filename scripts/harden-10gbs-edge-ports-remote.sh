#!/bin/bash
# Remote body for scripts/harden-10gbs-edge-ports.cjs — run on 10gbs only.
# Disables leftover XUI so nexlify-iptv-edge permanently owns media ports.
set -euo pipefail

echo '=== BEFORE ==='
ss -lntp | grep -E ':80|:443|:8080|:25461|:18080|:18443' || true
echo -n 'xuione enabled='; systemctl is-enabled xuione 2>/dev/null || echo n/a
echo -n 'xuione active='; systemctl is-active xuione 2>/dev/null || echo n/a

echo '=== DISABLE xuione (leave files) ==='
if systemctl cat xuione.service >/dev/null 2>&1; then
  systemctl disable --now xuione.service || true
  systemctl stop xuione.service 2>/dev/null || true
  systemctl disable xuione.service 2>/dev/null || true
fi

echo '=== STOP leftover XUI nginx ==='
for pat in '/home/xui/bin/nginx/sbin/nginx' '/home/xui/bin/nginx_rtmp/sbin/nginx_rtmp'; do
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  if [ -n "${pids}" ]; then
    echo "stopping $pat -> $pids"
    # shellcheck disable=SC2086
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -KILL $pids 2>/dev/null || true
  fi
done

reclaim_xui_on_port() {
  local port="$1"
  local line pid cmd
  while read -r line; do
    [ -z "$line" ] && continue
    pid=$(echo "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
    [ -z "$pid" ] && continue
    cmd=$(tr '\0' ' ' < /proc/"$pid"/cmdline 2>/dev/null || true)
    case "$cmd" in
      */home/xui/bin/nginx*|*/home/xui/bin/nginx_rtmp*)
        echo "killing xui holder of :$port pid=$pid"
        kill -TERM "$pid" 2>/dev/null || true
        sleep 1
        kill -KILL "$pid" 2>/dev/null || true
        ;;
      *)
        echo "leaving :$port pid=$pid ($cmd)"
        ;;
    esac
  done < <(ss -lntp 2>/dev/null | grep -E ":${port}\\b" || true)
}

for port in 80 443 8080 25461; do
  reclaim_xui_on_port "$port"
done

HTTP_CONF=/home/xui/bin/nginx/conf/ports/http.conf
HTTPS_CONF=/home/xui/bin/nginx/conf/ports/https.conf
TS=$(date +%Y%m%d%H%M%S)
if [ -f "$HTTP_CONF" ] && ! grep -qx 'listen 18080;' "$HTTP_CONF" 2>/dev/null; then
  cp -a "$HTTP_CONF" "${HTTP_CONF}.bak-nexlify-${TS}"
  printf '%s\n' 'listen 18080;' > "$HTTP_CONF"
  echo "rewrote $HTTP_CONF -> listen 18080"
fi
if [ -f "$HTTPS_CONF" ] && ! grep -qx 'listen 18443 ssl;' "$HTTPS_CONF" 2>/dev/null; then
  cp -a "$HTTPS_CONF" "${HTTPS_CONF}.bak-nexlify-${TS}"
  printf '%s\n' 'listen 18443 ssl;' > "$HTTPS_CONF"
  echo "rewrote $HTTPS_CONF -> listen 18443 ssl"
fi

mkdir -p /etc/systemd/system/pm2-root.service.d
cat > /etc/systemd/system/pm2-root.service.d/after-xuione.conf <<'EOF'
[Unit]
After=xuione.service network-online.target
Wants=network-online.target
EOF

cat > /usr/local/bin/nexlify-edge-claim-80.sh <<'EOF'
#!/bin/bash
# Ensure nexlify-iptv-edge owns TCP :80 after boot.
# Only terminates leftover XUI nginx on :80 — never unrelated listeners.
sleep 30
if ! pm2 describe nexlify-iptv-edge >/dev/null 2>&1; then
  exit 0
fi
if ss -lntp | grep -qE '0.0.0.0:80 .*iptv-edge|0.0.0.0:80 .*node /opt/nexli'; then
  exit 0
fi
while read -r line; do
  [ -z "$line" ] && continue
  pid=$(echo "$line" | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
  [ -z "$pid" ] && continue
  cmd=$(tr '\0' ' ' < /proc/"$pid"/cmdline 2>/dev/null || true)
  case "$cmd" in
    */home/xui/bin/nginx*|*/home/xui/bin/nginx_rtmp*)
      echo "claim-80: killing xui pid=$pid ($cmd)"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -KILL "$pid" 2>/dev/null || true
      ;;
    *)
      echo "claim-80: not reclaiming non-xui pid=$pid ($cmd)"
      ;;
  esac
done < <(ss -lntp 2>/dev/null | grep -E ':80\b' || true)
sleep 1
if ! ss -lntp | grep -qE '0.0.0.0:80 .*iptv-edge|0.0.0.0:80 .*node /opt/nexli'; then
  pm2 restart nexlify-iptv-edge
fi
EOF
chmod +x /usr/local/bin/nexlify-edge-claim-80.sh

cat > /etc/systemd/system/nexlify-edge-claim-80.service <<'EOF'
[Unit]
Description=Ensure nexlify-iptv-edge owns TCP :80 after boot
After=network-online.target xuione.service pm2-root.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/nexlify-edge-claim-80.sh

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nexlify-edge-claim-80.service
systemctl enable pm2-root.service 2>/dev/null || true

if pm2 describe nexlify-iptv-edge >/dev/null 2>&1; then
  if ! ss -lntp | grep -qE '0.0.0.0:80 .*node /opt/nexli'; then
    pm2 restart nexlify-iptv-edge
    sleep 3
  fi
fi

echo '=== AFTER ==='
echo -n 'xuione enabled='; systemctl is-enabled xuione 2>/dev/null || echo n/a
echo -n 'xuione active='; systemctl is-active xuione 2>/dev/null || echo n/a
echo -n 'nexlify-edge-claim-80 enabled='; systemctl is-enabled nexlify-edge-claim-80 2>/dev/null || echo n/a
echo -n 'pm2-root enabled='; systemctl is-enabled pm2-root 2>/dev/null || echo n/a
echo 'listeners:'
ss -lntp | grep -E ':80|:443|:8080|:25461|:18080|:18443' || true
echo 'xui nginx left:'
ps aux | grep -E '[x]ui/bin/nginx|[n]ginx_rtmp' | head -10 || true
pm2 list 2>/dev/null | head -15 || true
curl -sS -m 5 -o /dev/null -w 'edge80_health=%{http_code}\n' http://127.0.0.1/edge/health || true
curl -sS -m 5 -o /dev/null -w 'edge8080_health=%{http_code}\n' http://127.0.0.1:8080/edge/health || true
