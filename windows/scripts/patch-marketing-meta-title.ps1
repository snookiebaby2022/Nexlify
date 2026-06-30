# Patch homepage meta title on nexlify.live (45-60 chars) and rebuild
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$titleFile = Join-Path $cfg.ProjectRoot "marketing-drop-in\seo\home-meta-title.txt"
$pyLocal = Join-Path $cfg.ProjectRoot "scripts\patch-marketing-meta-title.py"
$newTitle = (Get-Content -LiteralPath $titleFile -Raw).Trim()
$oldTitle = "IPTV Panel License & WHMCS Reseller Software"
if ($newTitle.Length -lt 45 -or $newTitle.Length -gt 60) {
  throw "Title must be 45-60 characters (got $($newTitle.Length)): $newTitle"
}

$configJson = (@{ old = $oldTitle; new = $newTitle } | ConvertTo-Json -Compress)
$configLocal = Join-Path $env:TEMP "marketing-meta-title.json"
Set-Content -LiteralPath $configLocal -Value $configJson -Encoding UTF8 -NoNewline

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
put "$configLocal" /tmp/marketing-meta-title.json
put "$pyLocal" /tmp/patch-marketing-meta-title.py
exit
"@
$scriptFile = Join-Path $env:TEMP "nexlify-patch-meta.txt"
Set-Content -LiteralPath $scriptFile -Value $winscpScript -Encoding ASCII
& $cfg.WinScp "/ini=nul" "/script=$scriptFile"
Remove-Item -LiteralPath $scriptFile, $configLocal -Force -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "WinSCP upload failed ($LASTEXITCODE)" }

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "python3 /tmp/patch-marketing-meta-title.py && cd /var/www/nexlify && npm run build && pm2 restart nexlify-web && sleep 2 && curl -s https://nexlify.live/ | grep -o '<title>[^<]*</title>' | head -1"

& $cfg.Plink @plinkArgs
Write-Host "Title ($($newTitle.Length) chars): $newTitle" -ForegroundColor Green
exit $LASTEXITCODE
