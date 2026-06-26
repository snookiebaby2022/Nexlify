# Package Nexlify IPTV panel for Linux installer download
param(
  [string]$PanelSrc = "C:\Users\lizzi\nexlify-panel",
  [string]$Out = ""
)

$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not $Out) {
  $Out = Join-Path $ProjectRoot "public\downloads\nexlify-panel.tar.gz"
}

if (-not (Test-Path (Join-Path $PanelSrc "package.json"))) {
  Write-Error "Panel not found at $PanelSrc - set -PanelSrc"
}

$downloadsDir = Split-Path $Out -Parent
if (-not (Test-Path $downloadsDir)) {
  New-Item -ItemType Directory -Path $downloadsDir -Force | Out-Null
}

Push-Location $PanelSrc
tar -czf $Out `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=.git `
  --exclude=.env `
  --exclude=.install-credentials `
  .
Pop-Location

$sizeMb = [math]::Round((Get-Item $Out).Length / 1MB, 1)
Write-Host "Created: $Out - ${sizeMb} megabytes"
Write-Host "Deploy site update so https://nexlify.live/downloads/nexlify-panel.tar.gz is available"
