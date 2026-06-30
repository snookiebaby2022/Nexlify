# Re-register PM2 panel on :3000 from deploy path (fixes nginx 502)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$remotePanel = if ($cfg.RemotePath) { $cfg.RemotePath } else { "/home/nexlify-panel" }

$scripts = @(
  "scripts\vps-fix-panel-502.sh",
  "scripts\vps-fix-both-sites.sh",
  "scripts\vps-fix-marketing-502.sh",
  "scripts\has-valid-next-build.sh",
  "scripts\prepare-standalone.sh",
  "scripts\pm2-start.sh",
  "scripts\ensure-panel-env.sh",
  "scripts\ensure-marketing-env.sh",
  "scripts\sync-marketing-env.py",
  "scripts\sync-marketing-admin.cjs",
  "scripts\verify-panel-upstream.sh",
  "ecosystem.config.cjs"
)

$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }
$openLine = if ($cfg.PrivateKey) {
  "open sftp://$($cfg.Username)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
} else {
  "open sftp://$($cfg.Username):$($cfg.Password)@$($cfg.Host):$($cfg.Port)/$hostKeyOpt"
}

$putLines = @()
foreach ($rel in $scripts) {
  $local = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $local)) { continue }
  $remote = "$remotePanel/" + ($rel -replace '\\', '/')
  $putLines += "put `"$local`" $remote"
}
# nginx configs (upstream port must match marketing PM2 on 13001)
foreach ($rel in @("nginx\nexlify-upstream.conf", "nginx\nexlify.live.conf", "nginx\panel.nexlify.live.conf")) {
  $local = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $local)) { continue }
  $remote = "$remotePanel/" + ($rel -replace '\\', '/')
  $putLines += "put `"$local`" $remote"
}
foreach ($rel in @("src\app\api\auth\login\route.ts")) {
  $local = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $local)) { continue }
  $remote = "$remotePanel/" + ($rel -replace '\\', '/')
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
$f = Join-Path $env:TEMP "fix-panel-502.txt"
Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII

$plinkPre = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkPre += "-i", $cfg.PrivateKey } else { $plinkPre += "-pw", $cfg.Password }
$plinkPre += "mkdir -p $remotePanel/scripts $remotePanel/src/app/api/auth/login"
& $cfg.Plink @plinkPre 2>&1 | Out-Host

& $cfg.WinScp "/ini=nul" "/script=$f"
Remove-Item $f -Force -ErrorAction SilentlyContinue

$remoteCmd = "cd $remotePanel && sed -i 's/\r$//' scripts/*.sh 2>/dev/null; chmod +x scripts/*.sh; rm -rf .next && npm run build && bash scripts/prepare-standalone.sh && pm2 delete nexlify 2>/dev/null || true; ./scripts/pm2-start.sh"

$plinkArgs = @("-batch", "-ssh", "$($cfg.Username)@$($cfg.Host)", "-P", "$($cfg.Port)")
if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
$plinkArgs += $remoteCmd

Write-Host "Fixing panel 502 on $($cfg.Host)..." -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $cfg.Plink @plinkArgs 2>&1 | ForEach-Object { Write-Host $_ }
$code = $LASTEXITCODE
$ErrorActionPreference = $prevEap

$panelUrl = if ($cfg.PanelUrl) { $cfg.PanelUrl } else { "https://panel.nexlify.live" }
$marketingUrl = if ($cfg.MarketingUrl) { $cfg.MarketingUrl } else { "https://nexlify.live" }
$allOk = $true

try {
  $panel = Invoke-WebRequest -Uri "$panelUrl/api/health" -UseBasicParsing -TimeoutSec 20
  if ($panel.StatusCode -eq 200) {
    Write-Host "OK: $panelUrl/api/health" -ForegroundColor Green
  } else { $allOk = $false }
} catch {
  Write-Host "FAIL: $panelUrl - $($_.Exception.Message)" -ForegroundColor Red
  $allOk = $false
}

foreach ($path in @("/", "/webplayer")) {
  try {
    $r = Invoke-WebRequest -Uri "$marketingUrl$path" -UseBasicParsing -TimeoutSec 20 -MaximumRedirection 0 -ErrorAction SilentlyContinue
    $code = [int]$r.StatusCode
  } catch {
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode.value__ }
    else { $code = 0 }
  }
  if ($code -ge 200 -and $code -lt 400) {
    Write-Host "OK: $marketingUrl$path ($code)" -ForegroundColor Green
  } else {
    Write-Host "FAIL: $marketingUrl$path ($code)" -ForegroundColor Red
    $allOk = $false
  }
}

if ($allOk) {
  Write-Host "All sites healthy." -ForegroundColor Green
  exit 0
}

if ($code -ne 0) { throw "Remote fix failed (plink exit $code)" }
throw "Fix script finished but one or more public URLs still failing - check output above."
