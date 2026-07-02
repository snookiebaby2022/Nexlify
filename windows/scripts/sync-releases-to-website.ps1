# Sync src/lib/panel-releases.json to nexlify-web and rebuild
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$jsonLocal = Join-Path $cfg.ProjectRoot "src\lib\panel-releases.json"
$pyLocal = Join-Path $cfg.ProjectRoot "scripts\apply-releases-to-website.py"
$updatesLocal = Join-Path $cfg.ProjectRoot "marketing-drop-in\src\lib\updates.ts"
$featuresLocal = Join-Path $cfg.ProjectRoot "marketing-drop-in\src\app\features\page.tsx"
if (-not (Test-Path -LiteralPath $jsonLocal)) { throw "Missing $jsonLocal" }
if (-not (Test-Path -LiteralPath $pyLocal)) { throw "Missing $pyLocal" }
if (-not (Test-Path -LiteralPath $updatesLocal)) { throw "Missing $updatesLocal" }

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
put "$jsonLocal" /tmp/panel-releases.json
put "$jsonLocal" /var/www/nexlify/src/lib/panel-releases.json
put "$updatesLocal" /var/www/nexlify/src/lib/updates.ts
put "$pyLocal" /tmp/apply-releases-to-website.py
put "$featuresLocal" /var/www/nexlify/src/app/features/page.tsx
exit
"@

$scriptFile = Join-Path $env:TEMP "nexlify-sync-releases.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed ($LASTEXITCODE)" }

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "mkdir -p /var/www/nexlify/src/app/features && python3 /tmp/apply-releases-to-website.py && cd /var/www/nexlify && npm run build && pm2 restart nexlify-web --update-env"

& $cfg.Plink @plinkArgs
exit $LASTEXITCODE
