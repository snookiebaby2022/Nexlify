# Deploy llms.txt to nexlify.live (marketing site public/)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$local = Join-Path $cfg.ProjectRoot "marketing-drop-in\public\llms.txt"
if (-not (Test-Path -LiteralPath $local)) { throw "Missing $local" }

$hostKeyOpt = ""
if ($cfg.AcceptHostKey) { $hostKeyOpt = ' -hostkey="*"' }

$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$winscpScript = @"
option batch on
option confirm off
$openLine
put "$local" /var/www/nexlify/public/llms.txt
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-deploy-llms.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed ($LASTEXITCODE)" }

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "pm2 restart nexlify-web --update-env && sleep 2 && curl -sI http://127.0.0.1:3001/llms.txt | head -3"

& $cfg.Plink @plinkArgs
Write-Host "Live: https://nexlify.live/llms.txt" -ForegroundColor Green
exit $LASTEXITCODE
