. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$remoteCmd = "cd /home/nexlify-panel && bash scripts/publish-panel-release.sh"
Write-Host "Publishing panel release on $($cfg.Host)..."
if ($cfg.PrivateKey -and (Test-Path -LiteralPath $cfg.PrivateKey) -and $cfg.PrivateKey -notlike "*.ppk") {
  ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i $cfg.PrivateKey -p "$($cfg.Port)" "$($cfg.Username)@$($cfg.Host)" $remoteCmd
} else {
  $plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
  if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
  $plinkArgs += $remoteCmd
  & $cfg.Plink @plinkArgs
}
exit $LASTEXITCODE
