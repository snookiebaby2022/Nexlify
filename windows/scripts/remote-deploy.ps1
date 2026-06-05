# Run deploy-vps.sh on the server via PuTTY plink

param(

  [switch]$Pm2Only

)



. "$PSScriptRoot\Get-DeployConfig.ps1"

$cfg = Get-NexlifyDeployConfig



$cleanup = "rm -f src/instrumentation.ts src/lib/cron-scheduler.ts"

$remoteCmd = if ($Pm2Only) {

  "cd $($cfg.RemotePath) && $cleanup && sed -i 's/\r$//' scripts/*.sh ecosystem.config.cjs 2>/dev/null; chmod +x scripts/*.sh scripts/pm2-start.sh scripts/pm2-boot-enable.sh scripts/pm2-boot-enabled.sh 2>/dev/null; ./scripts/pm2-start.sh"

} else {

  "cd $($cfg.RemotePath) && $cleanup && sed -i 's/\r$//' scripts/*.sh ecosystem.config.cjs 2>/dev/null; chmod +x scripts/*.sh scripts/deploy-vps.sh scripts/pm2-start.sh scripts/pm2-boot-enable.sh scripts/pm2-boot-enabled.sh 2>/dev/null; ./scripts/deploy-vps.sh"

}



$plinkArgs = @(

  "-batch"

  "-ssh"

  "$($cfg.Username)@$($cfg.Host)"

  "-P", "$($cfg.Port)"

)



# PuTTY 0.81+ rejects -hostkey "*"; rely on cached host key after first connect.



if ($cfg.PrivateKey) {

  $plinkArgs += "-i", $cfg.PrivateKey

} else {

  $plinkArgs += "-pw", $cfg.Password

}



$plinkArgs += $remoteCmd



Write-Host "Running on server: $remoteCmd"



# plink writes warnings (e.g. Next.js SWC patch) to stderr — do not treat as PowerShell errors

$prevEap = $ErrorActionPreference

$ErrorActionPreference = "Continue"

$plinkOut = & $cfg.Plink @plinkArgs 2>&1

$exitCode = $LASTEXITCODE

$ErrorActionPreference = $prevEap



$plinkOut | ForEach-Object { Write-Host $_ }



if ($exitCode -ne 0) {

  Write-Host ""

  Write-Host "--- Last lines from server ---" -ForegroundColor Yellow

  ($plinkOut | Select-Object -Last 40) | ForEach-Object { Write-Host $_ }

  Write-Host ""

  Write-Host "Common fixes:" -ForegroundColor Yellow

  Write-Host "  1. SSH in and run:  cd $($cfg.RemotePath) && rm -f src/instrumentation.ts src/lib/cron-scheduler.ts && npm run build"

  Write-Host "  2. Paste the 'Failed to compile' block above (ignore SWC lockfile warnings if build succeeded)."

  throw "Remote deploy failed (plink exit $exitCode)"

}

Write-Host "Remote deploy finished."


