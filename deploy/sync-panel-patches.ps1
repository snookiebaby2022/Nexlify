# Copy nexlify-panel sources into stream-billing/deploy/panel-patches
$PanelRoot = "C:\Users\lizzi\nexlify-panel"
$Patches = "C:\Users\lizzi\Projects\stream-billing\deploy\panel-patches"

# Legacy flat-name copies (used by older patch scripts)
$flatMap = @{
  "admin-settings-updates-page.tsx" = "src/app/admin/settings/updates/page.tsx"
  "panel-update-route.ts"           = "src/app/api/admin/panel-update/route.ts"
  "panel-update-banner.tsx"         = "src/components/panel-update-banner.tsx"
  "panel-update-confirm-modal.tsx"  = "src/components/panel-update-confirm-modal.tsx"
  "panel-releases-feed.ts"          = "src/lib/panel-releases-feed.ts"
  "panel-version.ts"                = "src/lib/panel-version.ts"
  "ecosystem.config.cjs"            = "ecosystem.config.cjs"
  "panel-update.ts"                 = "src/lib/panel-update.ts"
  "panel-update-job.ts"             = "src/lib/panel-update-job.ts"
  "panel-update-cache.ts"           = "src/lib/panel-update-cache.ts"
  "panel-update-auto.ts"            = "src/lib/panel-update-auto.ts"
  "panel-update-progress.tsx"       = "src/components/panel-update-progress.tsx"
  "panel-shell.tsx"                 = "src/components/panel-shell.tsx"
  "encryption-at-rest.ts"         = "src/lib/encryption-at-rest.ts"
  "license-state.ts"                = "src/lib/license/state.ts"
  "license-index.ts"                = "src/lib/license/index.ts"
  "billing-addon-sync.ts"           = "src/lib/billing-addon-sync.ts"
}

foreach ($patch in $flatMap.Keys) {
  $rel = $flatMap[$patch]
  $src = Join-Path $PanelRoot $rel
  $dstFlat = Join-Path $Patches $patch
  $dstTree = Join-Path $Patches $rel
  if (-not (Test-Path $src)) {
    Write-Warning "Missing source: $src"
    continue
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $dstTree) | Out-Null
  Copy-Item $src $dstFlat -Force
  Copy-Item $src $dstTree -Force
  Write-Host "Copied $rel -> deploy/panel-patches/ (+ src tree)"
}

$scripts = @(
  "apply-panel-fast-update.sh",
  "apply-panel-v1.4.0.sh",
  "clear-stuck-update.json",
  "clear-update-idle.json"
)
foreach ($script in $scripts) {
  $src = Join-Path $Patches $script
  if (Test-Path $src) {
    Write-Host "OK: $script"
  } else {
    Write-Warning "Missing patch script: $script"
  }
}

Write-Host "Done. Full tree sync on VPS uses apply-audit-fixes-all.sh with PANEL_PATCH_SRC=$PanelRoot"
