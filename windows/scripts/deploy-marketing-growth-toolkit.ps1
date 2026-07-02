# Deploy marketing-growth-toolkit.ps1 — CSS + file sync only (no rebuild; main deploy handles build)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig

$toolkit = Join-Path $cfg.ProjectRoot "marketing-growth-toolkit"
$sh = Join-Path $toolkit "scripts\deploy-to-nexlify-web.sh"
$py = Join-Path $toolkit "scripts\patch-marketing-growth-css.py"
$css = Join-Path $toolkit "growth-globals-snippet.css"

foreach ($f in @($sh, $py, $css)) {
  if (-not (Test-Path -LiteralPath $f)) { throw "Missing: $f" }
}

$winScp = $cfg.WinScp
$scriptFile = Join-Path $env:TEMP "nexlify-deploy-growth-toolkit.txt"

@"
option batch on
option confirm off
open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/ -hostkey=* $(if ($cfg.PrivateKey) { "-privatekey=`"$($cfg.PrivateKey)`"" } else { "-password=`"$($cfg.Password)`"" })
cd $($cfg.RemotePath)
put "$toolkit" marketing-growth-toolkit
put "$py" marketing-growth-toolkit/scripts/patch-marketing-growth-css.py
put "$css" marketing-growth-toolkit/growth-globals-snippet.css
put "$sh" marketing-growth-toolkit/scripts/deploy-to-nexlify-web.sh
exit
"@ | Set-Content -Path $scriptFile -Encoding ASCII

& $winScp /script="$scriptFile"
if ($LASTEXITCODE -ne 0) { throw "WinSCP sync failed" }

$remoteSh = "$($cfg.RemotePath)/marketing-growth-toolkit/scripts/deploy-to-nexlify-web.sh"
$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += "sed -i 's/\r$//' '$remoteSh' && chmod +x '$remoteSh' && bash '$remoteSh' '$($cfg.RemotePath)'"

Write-Host "Deploying growth toolkit to nexlify.live..." -ForegroundColor Cyan
& $cfg.Plink @plinkArgs
if ($LASTEXITCODE -ne 0) { throw "Deploy failed" }

Write-Host ""
Write-Host "Live:" -ForegroundColor Green
Write-Host "  https://nexlify.live/grow"
Write-Host "  https://nexlify.live/grow/links"
Write-Host "  https://nexlify.live/promo/tiktok?utm_source=tiktok&utm_medium=bio&utm_campaign=operators"
