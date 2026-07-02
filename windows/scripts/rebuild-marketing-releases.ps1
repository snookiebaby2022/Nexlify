$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$jsonLocal = Join-Path $cfg.ProjectRoot "src\lib\panel-releases.json"
$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$winscp = @"
option batch on
option confirm off
$openLine
put "$jsonLocal" /var/www/nexlify/src/lib/panel-releases.json
exit
"@
$scriptFile = Join-Path $env:TEMP "nexlify-marketing-releases.txt"
Set-Content -LiteralPath $scriptFile -Value $winscp -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed ($LASTEXITCODE)" }

$remoteCmd = "cd /var/www/nexlify && npm run build && pm2 restart nexlify-web --update-env"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Rebuilding marketing site with updated release notes..."
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $cfg.Plink @plinkArgs 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap
if ($code -ne 0) { throw "Marketing rebuild failed (exit $code)" }
Write-Host "Marketing rebuild complete."
