#!/usr/bin/env bash
# Remote LB recovery: nginx, agent, pm2 systemd, iptv-edge (SSH target).
set +e

systemctl enable nginx >/dev/null 2>&1
systemctl start nginx >/dev/null 2>&1
systemctl enable nexlify-agent >/dev/null 2>&1
systemctl start nexlify-agent >/dev/null 2>&1
systemctl enable pm2-root >/dev/null 2>&1
systemctl enable pm2-ubuntu >/dev/null 2>&1
rm -f /root/.pm2/pm2.pid
systemctl start pm2-root >/dev/null 2>&1 || systemctl start pm2-ubuntu >/dev/null 2>&1 || true

PANEL=/opt/nexlify-panel
if [ -d "$PANEL" ] && [ -x "$PANEL/scripts/ensure-iptv-edge-pm2.sh" ]; then
  bash "$PANEL/scripts/ensure-iptv-edge-pm2.sh" || true
elif [ -d "$PANEL" ] && [ -f "$PANEL/scripts/iptv-edge-proxy.mjs" ]; then
  cd "$PANEL" || exit 0
  pm2 resurrect >/dev/null 2>&1 || true
  if [ -x "$PANEL/scripts/ensure-iptv-edge-pm2.sh" ]; then
    bash "$PANEL/scripts/ensure-iptv-edge-pm2.sh" || true
  elif command -v pm2 >/dev/null 2>&1; then
    set -a
    # shellcheck disable=SC1091
    [ -f .env ] && . ./.env
    set +a
    export IPTV_EDGE_REMOTE_NODE=1
    pm2 start scripts/iptv-edge-proxy.mjs --name nexlify-iptv-edge --cwd "$PANEL" --interpreter node --update-env --max-memory-restart 8192M 2>/dev/null || \
      pm2 restart nexlify-iptv-edge --update-env >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
  fi
fi

command -v ufw >/dev/null && ufw allow 8080/tcp >/dev/null 2>&1
command -v ufw >/dev/null && ufw allow 25461/tcp >/dev/null 2>&1
sleep 2
echo "AFTER_LISTEN=$(ss -lntp 2>/dev/null | awk '/:80 |:443 |:8080 |:25461 /{print $4}' | tr '\n' ' ')"
echo "AFTER_AGENT=$(systemctl is-active nexlify-agent 2>/dev/null)"
echo "AFTER_EDGE=$(pm2 jlist 2>/dev/null | python3 -c 'import json,sys
try:
 d=json.load(sys.stdin)
except Exception:
 print("none"); raise SystemExit
print(",".join(p.get("name")+":"+(p.get("pm2_env") or {}).get("status","") for p in d))' 2>/dev/null)"
