# Fix 502 on nexlify.live — rebuild marketing app + restart PM2 on port 3001
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$remotePanel = if ($cfg.RemotePath) { $cfg.RemotePath } else { "/home/nexlify-panel" }

$localSh = Join-Path $root "scripts\vps-fix-marketing-502.sh"
$localEnsure = Join-Path $root "scripts\ensure-marketing-env.sh"
$localSyncEnv = Join-Path $root "scripts\sync-marketing-env.py"
$localSyncAdmin = Join-Path $root "scripts\sync-marketing-admin.cjs"
$dropFiles = @(
  "marketing-drop-in\src\app\livestream\page.tsx",
  "marketing-drop-in\src\app\api\livestream\status\route.ts",
  "marketing-drop-in\src\components\LivestreamPlayer.tsx",
  "marketing-drop-in\src\components\ObsSetupPanel.tsx",
  "marketing-drop-in\src\lib\livestream.ts",
  "marketing-drop-in\src\components\AuthForm.tsx",
  "marketing-drop-in\src\app\api\auth\login\route.ts",
  "marketing-drop-in\src\app\login\page.tsx",
  "marketing-drop-in\src\app\webplayer\page.tsx",
  "marketing-drop-in\src\lib\webplayer-proxy.ts",
  "marketing-drop-in\src\app\api\webplayer\xtream\route.ts",
  "marketing-drop-in\src\app\api\webplayer\fetch\route.ts"
)

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$putLines = @(
  "put `"$localSh`" $remotePanel/scripts/vps-fix-marketing-502.sh",
  "put `"$localEnsure`" $remotePanel/scripts/ensure-marketing-env.sh",
  "put `"$localSyncEnv`" $remotePanel/scripts/sync-marketing-env.py",
  "put `"$localSyncAdmin`" $remotePanel/scripts/sync-marketing-admin.cjs"
)
foreach ($rel in $dropFiles) {
  $local = Join-Path $root $rel
  $remote = "/var/www/nexlify/src/" + ($rel -replace '\\','/' -replace '^marketing-drop-in/src/','')
  $putLines += "put `"$local`" $remote"
}
$putBlock = $putLines -join "`n"

$winscp = @"
option batch on
option confirm off
$openLine
$putBlock
exit
"@
$f = Join-Path $env:TEMP "fix-marketing-502.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "mkdir -p $remotePanel/scripts /var/www/nexlify/src/app/livestream /var/www/nexlify/src/app/api/livestream/status /var/www/nexlify/src/app/api/auth/login /var/www/nexlify/src/app/api/webplayer/xtream /var/www/nexlify/src/app/api/webplayer/fetch /var/www/nexlify/src/app/login /var/www/nexlify/src/app/webplayer /var/www/nexlify/src/components /var/www/nexlify/src/lib"
& $cfg.Plink @plinkPre 2>&1 | Out-Host

& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remote = "sed -i 's/\r$//' $remotePanel/scripts/vps-fix-marketing-502.sh && chmod +x $remotePanel/scripts/vps-fix-marketing-502.sh && sudo bash $remotePanel/scripts/vps-fix-marketing-502.sh"

$plink = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plink += "-i", $cfg.PrivateKey } else { $plink += "-pw", $cfg.Password }
$plink += $remote

Write-Host "Fixing marketing 502 on $($cfg.Host)..." -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $cfg.Plink @plink 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($code -ne 0) { Write-Error "Fix failed (exit $code)" }

$marketingUrl = if ($cfg.MarketingUrl) { $cfg.MarketingUrl } else { "https://nexlify.live" }
try {
  $body = '{"email":"admin@nexlify.live","password":"wrong"}'
  $r = Invoke-WebRequest -Uri "$marketingUrl/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 20
  $sc = [int]$r.StatusCode
} catch {
  if ($_.Exception.Response) { $sc = [int]$_.Exception.Response.StatusCode.value__ }
  else { $sc = 0 }
}
if ($sc -eq 401) {
  Write-Host "OK: $marketingUrl/api/auth/login returns 401 for bad password (not 500)" -ForegroundColor Green
} elseif ($sc -ge 500) {
  Write-Host "WARN: login API still returns $sc - check JWT_SECRET and DATABASE_URL on VPS" -ForegroundColor Yellow
} else {
  Write-Host "Login API HTTP $sc" -ForegroundColor Cyan
}

Write-Host "Done - test https://nexlify.live/login" -ForegroundColor Green
