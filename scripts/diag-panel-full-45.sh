#!/usr/bin/env bash
# Full panel + port + worker diagnosis for server 45.
set +e
cd /opt/nexlify-panel 2>/dev/null || cd "$(dirname "$0")/.."
echo "=== TIME / LOAD / MEM ==="
date -u; uptime; free -h
echo "=== ENV (workers/streaming) ==="
grep -E '^(PANEL_INSTANCES|NEXLIFY_STREAMING|NEXLIFY_PANEL|REDIS|PORT|PANEL_PORT|NEXLIFY_USE_IPTV)' .env 2>/dev/null | sort
echo "=== PM2 ==="
pm2 status 2>/dev/null
pm2 jlist 2>/dev/null | node -pe "
const list=JSON.parse(require('fs').readFileSync(0,'utf8'));
list.filter(p=>['nexlify','nexlify-iptv-edge','nexlify-cron','nexlify-hls','nexlify-web'].includes(p.name))
  .map(p=>({name:p.name,id:p.pm_id,status:p.pm2_env?.status,restarts:p.pm2_env?.restart_time,
    mem:Math.round((p.monit?.memory||0)/1048576)+'mb',cpu:p.monit?.cpu}))
" 2>/dev/null
echo "=== PORT BINDINGS (conflicts?) ==="
ss -tlnp 2>/dev/null | grep -E ':80 |:443 |:8080 |:13000 |:13001 |:13081 |:8787 ' || netstat -tlnp 2>/dev/null | grep -E ':80 |:443 |:8080 |:13000 '
echo "=== nginx test ==="
nginx -t 2>&1
echo "=== nginx :8080 configs ==="
grep -rl 'listen.*8080' /etc/nginx/ 2>/dev/null
echo "=== CRON (scale/watchdog) ==="
crontab -l 2>/dev/null | grep -E 'watchdog|scale-panel|wedge|ensure-panel' || true
grep -rE 'watchdog|scale-panel|wedge' /etc/cron.d/ 2>/dev/null | head -10 || true
echo "=== RECENT WATCHDOG / WEDGE ==="
tail -20 /var/log/nexlify-watchdog.log 2>/dev/null || tail -20 /root/.pm2/logs/nexlify-watchdog-out.log 2>/dev/null || true
tail -10 /var/log/nexlify-worker-wedge.log 2>/dev/null || true
echo "=== REDIS / PG ==="
redis-cli ping 2>/dev/null || echo "redis FAIL"
sudo -u postgres psql -d nexlify -t -c "SELECT state, count(*) FROM pg_stat_activity WHERE datname='nexlify' GROUP BY state;" 2>/dev/null
sudo -u postgres psql -d nexlify -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='nexlify';" 2>/dev/null
echo "=== TIMINGS ==="
curl -sS -m 15 -o /dev/null -w "health13000: %{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
curl -sS -m 15 -o /dev/null -w "login8080: %{http_code} t=%{time_total}s\n" http://127.0.0.1:8080/login
curl -sS -m 15 -o /dev/null -w "player8080: %{http_code} t=%{time_total}s\n" "http://127.0.0.1:8080/player_api.php"
echo "=== LIVE AUTH (10gbs path) ==="
node scripts/test-auth-10gbs-to-panel.cjs 2>&1 | tail -5
echo "=== AUTO-SCALE DB ==="
node -e "
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
p.streamServer.findFirst({where:{isActive:true},select:{autoScaleEnabled:true,autoScaleMinInstances:true,autoScaleMaxInstances:true,name:true}})
 .then(s=>console.log(JSON.stringify(s))).finally(()=>p.\$disconnect());
" 2>/dev/null
echo "=== ERRORS (last 8) ==="
pm2 logs nexlify --err --lines 8 --nostream 2>/dev/null
echo "DIAG_FULL_OK"
