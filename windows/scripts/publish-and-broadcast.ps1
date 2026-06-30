. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$publishCmd = "cd /home/nexlify-panel && bash scripts/publish-panel-release.sh"
$broadcastCmd = @"
cd /var/www/nexlify && npx prisma generate && set -a && [ -f .env ] && . ./.env && set +a && npx tsx scripts/broadcast-panel-update.ts
"@

function Invoke-Remote($cmd) {
  $plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
  if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
  $plinkArgs += $cmd
  & $cfg.Plink @plinkArgs
  if ($LASTEXITCODE -ne 0) { throw "Remote command failed: $cmd" }
}

Write-Host "Publishing panel tarball..."
Invoke-Remote $publishCmd

Write-Host "Broadcasting updates to registered customer panels..."
Invoke-Remote $broadcastCmd

Write-Host "Global panel update push complete."
