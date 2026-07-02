# Run license diagnostics on VPS (fix env, issue key, test-license.mjs)
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$remoteCmd = @"
cd $($cfg.RemotePath) && bash scripts/fix-vps-env.sh && npm run license:derive-public && npm run license:sync-public-key && export NEXT_PRIVATE_WORKER_THREADS=false && npm run build && ./scripts/pm2-start.sh && set -a && . ./.env && set +a && npm run license:issue -- --email vps-test@nexlify.local --term 3m 2>&1 | tee /tmp/nxl-issue.log && KEY=`$(grep -E '^NXLF1\.' /tmp/nxl-issue.log | head -1) && echo ISSUED_LEN=`${#KEY} && node scripts/test-license.mjs "`$KEY"
"@

$plinkArgs = @(
  "-batch"
  "-ssh"
  "$($cfg.Username)@$($cfg.Host)"
  "-P", "$($cfg.Port)"
)

if ($cfg.PrivateKey) {
  $plinkArgs += "-i", $cfg.PrivateKey
} else {
  $plinkArgs += "-pw", $cfg.Password
}

$plinkArgs += $remoteCmd

Write-Host "Running license test on VPS..."
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) {
  throw "Remote license test failed (plink exit $LASTEXITCODE)"
}
