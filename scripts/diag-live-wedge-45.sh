#!/usr/bin/env bash
set +e
cd /opt/nexlify-panel

echo "=== PM2 workers ==="
pm2 jlist | node -e '
const p = JSON.parse(require("fs").readFileSync(0, "utf8"));
console.log(p.filter(x => x.name.startsWith("nexlify")).map(x => ({
  name: x.name, id: x.pm_id, status: x.pm2_env.status,
  restarts: x.pm2_env.restart_time,
  rssMb: Math.round((x.monit.memory || 0) / 1048576),
  cpu: x.monit.cpu
})));
'

echo "=== active postgres work ==="
sudo -u postgres psql -d nexlify -x <<'SQL'
SELECT pid, state, wait_event_type, wait_event,
       now() - query_start AS age,
       left(replace(query, E'\n', ' '), 500) AS query
FROM pg_stat_activity
WHERE datname = 'nexlify' AND state <> 'idle'
ORDER BY query_start;
SQL

echo "=== postgres counts ==="
sudo -u postgres psql -d nexlify -x <<'SQL'
SELECT state, count(*) FROM pg_stat_activity
WHERE datname = 'nexlify' GROUP BY state ORDER BY state;
SQL

echo "=== recent panel errors ==="
pm2 logs nexlify --err --lines 40 --nostream 2>/dev/null

echo "=== recent panel output (catalog/auth markers) ==="
pm2 logs nexlify --out --lines 80 --nostream 2>/dev/null |
  grep -Ei 'catalog|xtream|live-auth|redis|cache|player_api|error|warn' |
  tail -60

echo "=== nginx current request paths ==="
if [ -r /var/log/nginx/access.log ]; then
  tail -5000 /var/log/nginx/access.log |
    awk '{print $7}' |
    sed 's/?username=.*//' |
    sort | uniq -c | sort -nr | awk 'NR<=25'
fi

echo "=== health ==="
curl -sS -m 5 -o /dev/null \
  -w 'health=%{http_code} total=%{time_total}s\n' \
  http://127.0.0.1:13000/api/health
