# Sync project to VPS (shared fast filemask + WinSCP batch mode)
param(
  [switch]$WhatIf
)

. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

if ($WhatIf) {
  Write-Host "Would sync $($cfg.ProjectRoot) -> $($cfg.Username)@$($cfg.Host):$($cfg.RemotePath)"
  Write-Host "Filemask: $(Get-NexlifyDeployFilemask)"
  exit 0
}

Sync-NexlifyPanelToRemote -HostName $cfg.Host -RemotePath $cfg.RemotePath -ProjectRoot $cfg.ProjectRoot -Password $(if ($cfg.Password) { $cfg.Password } else { "" }) -PrivateKey $cfg.PrivateKey -WinScp $cfg.WinScp -Port $cfg.Port -Username $cfg.Username -AcceptHostKey:$cfg.AcceptHostKey

Write-Host "Sync complete."
