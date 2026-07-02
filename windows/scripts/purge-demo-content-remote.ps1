. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$script = Get-Content "$PSScriptRoot\..\..\scripts\purge-demo-content.ts" -Raw
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))

function Invoke-Purge([string]$HostName, [string]$PanelPath, [string]$Password) {
  Write-Host "=== Purging demo on $HostName ===" -ForegroundColor Cyan
  $remoteCmd = "echo $b64 | base64 -d > $PanelPath/scripts/purge-demo-content.ts; cd $PanelPath; npx tsx scripts/purge-demo-content.ts"
  $plinkArgs = @("-batch", "-ssh", "root@$HostName", "-pw", $Password, $remoteCmd)
  & $cfg.Plink @plinkArgs
  if ($LASTEXITCODE -ne 0) { throw "Purge failed on $HostName" }
}

Invoke-Purge -HostName "75.119.137.174" -PanelPath "/opt/nexlify-panel" -Password "CkfUCKD6blClbTegdE9jYoO0vB7fR"
Write-Host "=== Customer dry-run verify ===" -ForegroundColor Cyan
$verifyCmd = "cd /opt/nexlify-panel; npx tsx scripts/purge-demo-content.ts --dry-run"
& $cfg.Plink @("-batch", "-ssh", "root@75.119.137.174", "-pw", "CkfUCKD6blClbTegdE9jYoO0vB7fR", $verifyCmd)

if ($cfg.PrivateKey) {
  $remoteCmd = "echo $b64 | base64 -d > $($cfg.RemotePath)/scripts/purge-demo-content.ts; cd $($cfg.RemotePath); npx tsx scripts/purge-demo-content.ts"
  $plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)", "-i", $cfg.PrivateKey, $remoteCmd)
  Write-Host "=== Purging demo on $($cfg.Host) ===" -ForegroundColor Cyan
  & $cfg.Plink @plinkArgs
} else {
  Invoke-Purge -HostName $cfg.Host -PanelPath $cfg.RemotePath -Password $cfg.Password
}

Write-Host "Demo purge finished on customer + vendor." -ForegroundColor Green
