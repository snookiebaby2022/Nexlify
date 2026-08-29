#!/usr/bin/env bash
set +e
cd /opt/nexlify-panel
echo "=== load/mem ==="
uptime; free -h
echo "=== PANEL_INSTANCES ==="
grep PANEL_INSTANCES .env 2>/dev/null
echo "=== PM2 ==="
pm2 status
pm2 jlist 2>/dev/null | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).filter(p=>p.name==='nexlify').map(p=>({id:p.pm_id,status:p.pm2_env.status,restarts:p.pm2_env.restart_time,mem:Math.round((p.monit?.memory||0)/1048576)+'mb',cpu:p.monit?.cpu}))"
echo "=== nexlify errors (last 15) ==="
pm2 logs nexlify --err --lines 15 --nostream 2>/dev/null
echo "=== connections ==="
ss -s 2>/dev/null | head -5
ss -tan state established 2>/dev/null | grep -c ':13000' || true
echo "=== pg connections ==="
sudo -u postgres psql -d nexlify -t -c "SELECT state, count(*) FROM pg_stat_activity WHERE datname='nexlify' GROUP BY state;" 2>/dev/null
echo "=== timings ==="
curl -sS -m 12 -o /dev/null -w "health:%{http_code} t=%{time_total}\n" http://127.0.0.1:13000/api/health
curl -sS -m 15 -o /dev/null -w "login:%{http_code} t=%{time_total}\n" http://127.0.0.1:8080/login
