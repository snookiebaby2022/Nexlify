param(
  [string]$PanelRoot = "C:\Users\lizzi\nexlify-panel",
  [string]$BillingRoot = "C:\Users\lizzi\Projects\stream-billing",
  [string]$VpsHost = "85.17.162.54",
  [string]$VpsUser = "root"
)

function Get-Md5([string]$Path) {
  if (Test-Path $Path) { return (Get-FileHash $Path -Algorithm MD5).Hash.ToLower() }
  return "MISSING"
}

function Get-RemoteMd5([string]$RemotePath) {
  $cmd = "md5sum '$RemotePath' 2>/dev/null | cut -d' ' -f1"
  $out = & ssh -o BatchMode=yes "${VpsUser}@${VpsHost}" $cmd 2>$null
  if ($out) { return $out.Trim().ToLower() }
  return "MISSING"
}

$patchMap = @{
  "admin-settings-updates-page.tsx" = "src/app/admin/settings/updates/page.tsx"
  "panel-update-route.ts"           = "src/app/api/admin/panel-update/route.ts"
  "panel-update-banner.tsx"         = "src/components/panel-update-banner.tsx"
  "panel-update-confirm-modal.tsx"  = "src/components/panel-update-confirm-modal.tsx"
  "panel-releases-feed.ts"          = "src/lib/panel-releases-feed.ts"
  "panel-version.ts"                = "src/lib/panel-version.ts"
  "ecosystem.config.cjs"            = "ecosystem.config.cjs"
  "panel-update.ts"                 = "src/lib/panel-update.ts"
  "panel-shell.tsx"                 = "src/components/panel-shell.tsx"
}

$billingMap = @{
  "src/components/SupportNav.tsx" = "/var/www/nexlify/src/components/SupportNav.tsx"
  "src/app/help/page.tsx"         = "/var/www/nexlify/src/app/help/page.tsx"
  "src/app/install/page.tsx"      = "/var/www/nexlify/src/app/install/page.tsx"
  "tsconfig.json"                 = "/var/www/nexlify/tsconfig.json"
  "next.config.ts"                = "/var/www/nexlify/next.config.ts"
}

Write-Host ""
Write-Host "=== panel-patches vs nexlify-panel ===" -ForegroundColor Cyan
$patchDiffs = @()
foreach ($patch in $patchMap.Keys) {
  $patchPath = Join-Path $BillingRoot "deploy\panel-patches\$patch"
  $panelPath = Join-Path $PanelRoot $patchMap[$patch]
  $p = Get-Md5 $patchPath
  $n = Get-Md5 $panelPath
  $ok = $p -eq $n
  if (-not $ok) { $patchDiffs += $patch }
  Write-Host ("{0,-36} {1}" -f $patch, ($(if ($ok) { "MATCH" } else { "DIFF" })))
}

Write-Host ""
Write-Host "=== nexlify-panel vs VPS /home/nexlify-panel ===" -ForegroundColor Cyan
$panelDiffs = @()
foreach ($patch in $patchMap.Keys) {
  $rel = $patchMap[$patch]
  $localPath = Join-Path $PanelRoot $rel
  $remotePath = "/home/nexlify-panel/$($rel -replace '\\','/')"
  $l = Get-Md5 $localPath
  $r = Get-RemoteMd5 $remotePath
  $ok = $l -eq $r
  if (-not $ok) { $panelDiffs += $rel }
  Write-Host ("{0,-50} {1}" -f $rel, ($(if ($ok) { "MATCH" } else { "DIFF" })))
}

Write-Host ""
Write-Host "=== stream-billing vs VPS /var/www/nexlify ===" -ForegroundColor Cyan
$billingDiffs = @()
foreach ($rel in $billingMap.Keys) {
  $localPath = Join-Path $BillingRoot $rel
  $remotePath = $billingMap[$rel]
  $l = Get-Md5 $localPath
  $r = Get-RemoteMd5 $remotePath
  $ok = $l -eq $r
  if (-not $ok) { $billingDiffs += $rel }
  Write-Host ("{0,-40} {1}" -f $rel, ($(if ($ok) { "MATCH" } else { "DIFF" })))
}

Write-Host ""
Write-Host "Summary: patchDiffs=$($patchDiffs.Count) panelDiffs=$($panelDiffs.Count) billingDiffs=$($billingDiffs.Count)"
