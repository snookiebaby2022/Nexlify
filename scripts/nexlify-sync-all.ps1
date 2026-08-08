# Nexlify repo sync for Windows (no bash required).
# Run from repo root: .\scripts\nexlify-sync-all.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

Write-Host "=== Nexlify repo sync ===" -ForegroundColor Cyan

Write-Host "-> Panel releases -> marketing"
Copy-Item -Force (Join-Path $Root "src\lib\panel-releases.json") `
    (Join-Path $Root "marketing-drop-in\src\lib\panel-releases.json")
npm run releases:sync

Write-Host "-> Installer scripts -> marketing public/install"
$install = Join-Path $Root "marketing-drop-in\public\install"
$scripts = Join-Path $Root "scripts"
New-Item -ItemType Directory -Force -Path $install, (Join-Path $install "scripts") | Out-Null

$copyMap = @{
    "install-linux.sh"                          = "panel.sh"
    "fix-panel-auto-update.sh"                  = "fix-panel-auto-update.sh"
    "fix-panel-restart.sh"                      = "fix-panel-restart.sh"
    "fix-panel-license-sync.sh"                 = "fix-panel-license-sync.sh"
    "fix-stream-edge-now.sh"                    = "fix-stream-edge-now.sh"
    "apply-panel-fast-update.sh"                = "apply-panel-fast-update.sh"
}
foreach ($src in $copyMap.Keys) {
    Copy-Item -Force (Join-Path $scripts $src) (Join-Path $install $copyMap[$src])
}

$scriptCopies = @(
    "panel-restart-safe.sh", "panel-update-recover.sh", "install-mediamtx-webrtc.sh",
    "installer-finalize-ports.sh", "sync-panel-ports.sh", "nexlify-firewall-ports.sh",
    "nexlify-port-registry.sh", "install-nginx-stream-edge.sh", "install-nginx-rtmp.sh",
    "install-nginx-https-extra-ports.sh", "install-monolithic-profile.sh",
    "install-local-stream-agent.sh", "fix-stream-edge-now.sh", "verify-panel-ports.sh",
    "has-valid-next-build.sh", "load-env.cjs", "panel-port-config.sh",
    "set-admin-password.cjs", "verify-install-smoke.sh", "verify-install-login.sh",
    "verify-panel-admin-login.cjs", "reset-panel-admin.sh"
)
foreach ($f in $scriptCopies) {
    Copy-Item -Force (Join-Path $scripts $f) (Join-Path $install "scripts\$f")
}
Copy-Item -Force (Join-Path $scripts "fix-panel-ip-login.sh") (Join-Path $install "scripts\fix-ip-login.sh")
Copy-Item -Force (Join-Path $scripts "fix-panel-ip-login.sh") (Join-Path $install "fix-ip-login.sh") -ErrorAction SilentlyContinue

$pkg = Get-Content (Join-Path $Root "package.json") | ConvertFrom-Json
$ver = $pkg.version -replace '\.', ''
foreach ($sh in @("apply-panel-fast-update.sh", "panel.sh")) {
    $path = Join-Path $install $sh
    if (Test-Path $path) {
        (Get-Content $path -Raw) -replace 'PANEL_CACHE_BUST="\$\{PANEL_CACHE_BUST:-v[0-9a-zA-Z]*\}"', "PANEL_CACHE_BUST=`"`${PANEL_CACHE_BUST:-v$ver}`"" |
            Set-Content $path -NoNewline
    }
}

Write-Host "-> Generate VPS deploy bundle"
$genSh = Join-Path $Root "marketing-drop-in\scripts\generate-vps-bundle.sh"
$bash = $null
foreach ($candidate in @(
    (Get-Command bash -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe"
)) {
    if ($candidate -and (Test-Path $candidate)) { $bash = $candidate; break }
}
if ($bash) {
    & $bash $genSh
} else {
    Write-Host "ERROR: bash not found. Install Git for Windows (includes Git Bash), then re-run." -ForegroundColor Red
    Write-Host "  https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== Sync complete ===" -ForegroundColor Green
Write-Host "Upload: marketing-drop-in\scripts\vps-full-update.sh -> VPS /root/"
Write-Host "VPS panel: git pull && ./scripts/deploy-vps.sh && bash scripts/publish-panel-release.sh"
