# Deploy GA4 components to nexlify.live and rebuild
param(
  [string]$MeasurementId = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$root = Join-Path $cfg.ProjectRoot "marketing-drop-in\src\components"
$ga = Join-Path $root "GoogleAnalytics.tsx"
$pv = Join-Path $root "GoogleAnalyticsPageView.tsx"
$py = Join-Path $cfg.ProjectRoot "scripts\patch-marketing-google-analytics.py"
$sh = Join-Path $cfg.ProjectRoot "scripts\deploy-google-analytics-remote.sh"

foreach ($f in @($ga, $pv, $py, $sh)) {
  if (-not (Test-Path -LiteralPath $f)) { throw "Missing $f" }
}

$hostKeyOpt = ""
if ($cfg.AcceptHostKey) { $hostKeyOpt = ' -hostkey="*"' }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$putGaId = ""
if ($MeasurementId -match '^G-[A-Z0-9]+$') {
  $gaIdFile = Join-Path $env:TEMP "ga-measurement-id.txt"
  Set-Content -LiteralPath $gaIdFile -Value $MeasurementId -Encoding ASCII -NoNewline
  $putGaId = "put `"$gaIdFile`" /tmp/ga-measurement-id.txt"
}

$winscpScript = @"
option batch on
option confirm off
$openLine
put "$ga" /var/www/nexlify/src/components/GoogleAnalytics.tsx
put "$pv" /var/www/nexlify/src/components/GoogleAnalyticsPageView.tsx
put "$py" /tmp/patch-marketing-google-analytics.py
put "$sh" /tmp/deploy-google-analytics-remote.sh
$putGaId
exit
"@
$scriptFile = Join-Path $env:TEMP "nexlify-deploy-ga.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed ($LASTEXITCODE)" }

$bash = (Get-Content -LiteralPath $sh -Raw) -replace "`r`n", "`n" -replace "`r", ""
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bash))

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "echo $b64 | base64 -d | bash"

& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($MeasurementId) {
  Write-Host "Google Analytics live with $MeasurementId" -ForegroundColor Green
} else {
  Write-Host "GA4 code deployed. Add your ID:" -ForegroundColor Yellow
  Write-Host "  .\windows\scripts\deploy-google-analytics.ps1 -MeasurementId G-XXXXXXXXXX" -ForegroundColor Yellow
}
