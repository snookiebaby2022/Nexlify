. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = @'
cd /home/nexlify-panel && rm -f src/instrumentation.ts src/lib/cron-scheduler.ts && rm -rf .next && export NEXT_PRIVATE_WORKER_THREADS=false && npm run build && bash scripts/prepare-standalone.sh && bash scripts/verify-standalone.sh && ./scripts/pm2-start.sh
'@
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd
Write-Host "Rebuilding on $($cfg.Host)..."
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Rebuild OK"
