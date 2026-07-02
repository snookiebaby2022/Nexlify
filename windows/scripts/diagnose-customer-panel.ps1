param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = @'
echo "=== PM2 ==="
pm2 list
echo "=== LISTEN ==="
ss -tlnp | grep -E ':80|:3000|:8080' || netstat -tlnp 2>/dev/null | grep -E ':80|:3000'
echo "=== CURL LOCAL ==="
curl -sS -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1/api/health || true
curl -sS -o /dev/null -w "login:%{http_code}\n" http://127.0.0.1/login || true
curl -sS -o /dev/null -w "health80:%{http_code}\n" http://127.0.0.1:80/api/health || true
echo "=== NGINX ==="
nginx -t 2>&1 || true
systemctl is-active nginx 2>/dev/null || service nginx status 2>&1 | head -3
echo "=== UPDATE JOB ==="
cat /opt/nexlify-panel/.update-progress.json 2>/dev/null || echo no job file
echo "=== PM2 ERRORS ==="
tail -25 /root/.pm2/logs/nexlify-error*.log 2>/dev/null | tail -20
echo "=== PANEL ENV PORT ==="
grep -E '^(PORT|PANEL_PORT|PANEL_BIND)' /opt/nexlify-panel/.env 2>/dev/null | head -5
'@

$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
& $cfg.Plink @plinkArgs
