# Full audit: local checks + vendor + customer + public URLs
param(
  [string]$CustomerHost = "75.119.137.174",
  [string]$CustomerPassword = "CkfUCKD6blClbTegdE9jYoO0vB7fR"
)
$ErrorActionPreference = "Continue"
. "$PSScriptRoot\Get-DeployConfig.ps1"
$cfg = Get-NexlifyDeployConfig
$root = $cfg.ProjectRoot
$issues = [System.Collections.Generic.List[string]]@()

function Add-Issue($msg) { $script:issues.Add($msg); Write-Host "ISSUE: $msg" -ForegroundColor Red }
function Add-Ok($msg) { Write-Host "OK: $msg" -ForegroundColor Green }

Write-Host "`n========== LOCAL AUDIT ==========" -ForegroundColor Cyan
$pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
Add-Ok "Local version $($pkg.version)"

# Shell script LF
$shCheck = & bash -c "cd '$($root -replace '\\','/')' && node scripts/fix-sh-lf.mjs 2>&1 | tail -3" 2>&1
Write-Host $shCheck

# TypeScript compile check (no emit)
Write-Host "Running tsc --noEmit..."
$tsc = & npx --prefix $root tsc --noEmit 2>&1
if ($LASTEXITCODE -ne 0) {
  $tscLines = ($tsc | Select-Object -First 15) -join "`n"
  Add-Issue "TypeScript errors:`n$tscLines"
} else { Add-Ok "TypeScript clean" }

Write-Host "`n========== PUBLIC URL AUDIT ==========" -ForegroundColor Cyan
$urls = @(
  @{ Url = "https://panel.nexlify.live/api/health"; Expect = 200; Label = "vendor panel health" },
  @{ Url = "https://panel.nexlify.live/login"; Expect = 200; Label = "vendor panel login" },
  @{ Url = "https://panel.nexlify.live/player_api.php?username=x&password=y"; Expect = @(401,400); Label = "vendor player_api" },
  @{ Url = "https://nexlify.live/api/health"; Expect = 200; Label = "marketing health" },
  @{ Url = "https://nexlify.live/install"; Expect = 200; Label = "marketing install page" },
  @{ Url = "https://nexlify.live/install/panel.sh"; Expect = 200; Label = "panel.sh" },
  @{ Url = "https://nexlify.live/install/scripts/has-valid-next-build.sh"; Expect = 200; Label = "bootstrap script" },
  @{ Url = "https://nexlify.live/api/panel-releases"; Expect = 200; Label = "releases API" }
)
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u.Url -UseBasicParsing -TimeoutSec 25
    $code = $r.StatusCode
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  }
  $exp = $u.Expect
  if ($exp -is [array]) {
    if ($exp -contains $code) { Add-Ok "$($u.Label) HTTP $code" } else { Add-Issue "$($u.Label) HTTP $code (expected $($exp -join '/'))" }
  } elseif ($code -eq $exp) { Add-Ok "$($u.Label) HTTP $code" }
  else { Add-Issue "$($u.Label) HTTP $code (expected $exp)" }
}

$rel = Invoke-RestMethod "https://nexlify.live/api/panel-releases" -TimeoutSec 15
if ($rel.latestVersion -eq $pkg.version) { Add-Ok "Published latestVersion=$($rel.latestVersion)" }
else { Add-Issue "Published latestVersion=$($rel.latestVersion) but local=$($pkg.version)" }

if ((Invoke-WebRequest "https://nexlify.live/install" -UseBasicParsing).Content -match 'v179') { Add-Ok "Install page shows v179" }
else { Add-Issue "Install page missing v179 installer tag" }

Write-Host "`n========== REMOTE VPS AUDIT ==========" -ForegroundColor Cyan
$auditSh = Join-Path $root "scripts\full-audit-smoke.sh"
$hostKeyOpt = if ($cfg.AcceptHostKey) { ' -hostkey="*"' } else { "" }

function Run-RemoteAudit($label, $hostSpec, $password, $panelPath) {
  Write-Host "`n--- $label ---" -ForegroundColor Yellow
  $openLine = if ($password) {
    "open sftp://root@$hostSpec`:22/$hostKeyOpt -password=`"$password`""
  } elseif ($cfg.PrivateKey) {
    "open sftp://$($cfg.Username)@$hostSpec`:$($cfg.Port)/$hostKeyOpt -privatekey=`"$($cfg.PrivateKey)`""
  } else {
    "open sftp://$($cfg.Username):$($cfg.Password)@$hostSpec`:$($cfg.Port)/$hostKeyOpt"
  }
  $winscp = @"
option batch on
option confirm off
$openLine
put "$auditSh" /tmp/full-audit-smoke.sh
exit
"@
  $f = Join-Path $env:TEMP "audit-upload-$label.txt"
  Set-Content -LiteralPath $f -Value $winscp -Encoding ASCII
  & $cfg.WinScp "/ini=nul" "/script=$f" 2>&1 | Out-Null
  $plinkArgs = if ($password) {
    @("-batch", "-ssh", "root@$hostSpec", "-pw", $password)
  } else {
    @("-batch", "-ssh", "$($cfg.Username)@$hostSpec", "-P", "$($cfg.Port)")
    if ($cfg.PrivateKey) { $plinkArgs += "-i", $cfg.PrivateKey } else { $plinkArgs += "-pw", $cfg.Password }
    $plinkArgs
  }
  $plinkArgs += "sed -i 's/\r$//' /tmp/full-audit-smoke.sh && chmod +x /tmp/full-audit-smoke.sh && PANEL_DIR=$panelPath bash /tmp/full-audit-smoke.sh"
  & $cfg.Plink @plinkArgs
  if ($LASTEXITCODE -ne 0) { Add-Issue "$label remote audit failed (exit $LASTEXITCODE)" }
}

Run-RemoteAudit -label "VENDOR" -hostSpec $cfg.Host -password $null -panelPath $cfg.RemotePath
Run-RemoteAudit -label "CUSTOMER" -hostSpec $CustomerHost -password $CustomerPassword -panelPath "/opt/nexlify-panel"

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan
if ($issues.Count -eq 0) {
  Write-Host "All audits passed." -ForegroundColor Green
  exit 0
} else {
  Write-Host "$($issues.Count) issue(s) found:" -ForegroundColor Red
  $issues | ForEach-Object { Write-Host "  - $_" }
  exit 1
}
