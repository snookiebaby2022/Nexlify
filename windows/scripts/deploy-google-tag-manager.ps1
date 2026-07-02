# Deploy Google Tag Manager (GTM-KTQ4K29X) to nexlify.live
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$gtm = Join-Path $cfg.ProjectRoot "marketing-drop-in\src\components\GoogleTagManager.tsx"
$py = Join-Path $cfg.ProjectRoot "scripts\patch-marketing-gtm.py"
$sh = Join-Path $cfg.ProjectRoot "scripts\deploy-gtm-remote.sh"

foreach ($f in @($gtm, $py, $sh)) {
  if (-not (Test-Path -LiteralPath $f)) { throw "Missing $f" }
}

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
put "$gtm" /var/www/nexlify/src/components/GoogleTagManager.tsx
put "$py" /tmp/patch-marketing-gtm.py
put "$sh" /tmp/deploy-gtm-remote.sh
exit
"@
$scriptFile = Join-Path $env:TEMP "nexlify-deploy-gtm.txt"
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
exit $LASTEXITCODE
