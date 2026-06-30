param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR",
  [string]$RemotePath = "/opt/nexlify-panel"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = "cd $RemotePath && pm2 stop nexlify 2>/dev/null; pm2 delete nexlify 2>/dev/null; rm -f .update-progress.json .update-progress.pid; export NEXT_PRIVATE_WORKER_THREADS=false && npm run build && bash scripts/prepare-standalone.sh && bash scripts/panel-restart-safe.sh --nexlify-only 2>/dev/null || bash scripts/pm2-start.sh && sleep 8 && pm2 list && curl -sS -o /dev/null -w health:%{http_code} http://127.0.0.1/api/health && echo && curl -sS -o /dev/null -w admin:%{http_code} http://127.0.0.1/admin/ && echo"

$plinkArgs = @("-batch", "-ssh", "root@$CustomerHost", "-pw", $CustomerPassword, $remoteCmd)
Write-Host "Repairing panel on $CustomerHost (build + restart)..." -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $cfg.Plink @plinkArgs 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($code -ne 0) { throw "Repair failed (exit $code)" }
Write-Host "Repair complete." -ForegroundColor Green
