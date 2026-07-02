param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = @"
cd $RemotePath
echo '=== VERSION ==='
node -p "require('./package.json').version" 2>/dev/null || true
echo '=== PM2 ==='
pm2 list | grep nexlify
echo '=== BUILD ==='
test -f .next/BUILD_ID && cat .next/BUILD_ID || echo 'NO BUILD_ID'
ls -la .next/static 2>/dev/null | head -3
echo '=== HEALTH ==='
curl -sS -o /dev/null -w 'health:%{http_code} ' http://127.0.0.1/api/health
curl -sS -o /dev/null -w 'login:%{http_code}\n' http://127.0.0.1/login
echo '=== STATIC SAMPLE ==='
CHUNK=\$(curl -sS http://127.0.0.1/login | grep -oE '/_next/static/[^\"]+' | head -1)
echo "chunk=\$CHUNK"
if [ -n "\$CHUNK" ]; then curl -sSI "http://127.0.0.1\$CHUNK" | head -3; fi
echo '=== ERRORS ==='
pm2 logs nexlify --lines 8 --nostream 2>/dev/null | tail -10
"@
& $cfg.Plink -batch -ssh "root@$CustomerHost" -pw $CustomerPassword $remoteCmd
