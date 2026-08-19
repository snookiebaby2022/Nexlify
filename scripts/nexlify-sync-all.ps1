# Nexlify repo sync for Windows.
# Run from anywhere: .\scripts\nexlify-sync-all.ps1
# Or:  cd C:\Users\lizzi\nexlify-panel; .\scripts\nexlify-sync-all.ps1

$ErrorActionPreference = "Stop"

function Find-NexlifyRoot([string]$Start) {
    $dir = (Resolve-Path $Start).Path
    while ($dir) {
        $pkg = Join-Path $dir "package.json"
        $mkt = Join-Path $dir "marketing-drop-in"
        if ((Test-Path $pkg) -and (Test-Path $mkt)) { return $dir }
        $parent = Split-Path $dir -Parent
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Nexlify repo not found. cd to C:\Users\lizzi\nexlify-panel first."
}

$startDir = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$Root = Find-NexlifyRoot $startDir
Set-Location $Root
Write-Host "Repo root: $Root" -ForegroundColor DarkGray

Write-Host "=== Nexlify repo sync ===" -ForegroundColor Cyan

Write-Host "-> Panel releases -> marketing"
Copy-Item -Force "$Root\src\lib\panel-releases.json" "$Root\marketing-drop-in\src\lib\panel-releases.json"
npm run releases:sync

Write-Host "-> Installer scripts -> marketing public/install"
$install = "$Root\marketing-drop-in\public\install"
$scripts = "$Root\scripts"
New-Item -ItemType Directory -Force -Path $install, "$install\scripts" | Out-Null

Copy-Item -Force "$scripts\install-linux.sh" "$install\panel.sh"
Copy-Item -Force "$scripts\install-linux.sh" "$Root\marketing-drop-in\scripts\install-linux.sh"
Copy-Item -Force "$scripts\fix-panel-auto-update.sh" "$install\"
Copy-Item -Force "$scripts\fix-panel-restart.sh" "$install\"
Copy-Item -Force "$scripts\fix-panel-license-sync.sh" "$install\"
Copy-Item -Force "$scripts\fix-stream-edge-now.sh" "$install\"
Copy-Item -Force "$scripts\apply-panel-fast-update.sh" "$install\"

$scriptCopies = @(
    "panel-restart-safe.sh", "panel-update-recover.sh", "install-mediamtx-webrtc.sh",
    "installer-finalize-ports.sh", "sync-panel-ports.sh", "nexlify-firewall-ports.sh",
    "nexlify-port-registry.sh", "nexlify-nginx-release-ports.sh",
    "install-nginx-stream-edge.sh", "install-iptv-edge-proxy.sh", "iptv-edge-proxy.mjs",
    "ensure-panel-env.sh", "pm2-start.sh",
    "install-nginx-rtmp.sh",
    "install-nginx-https-extra-ports.sh", "install-monolithic-profile.sh",
    "install-local-stream-agent.sh", "fix-stream-edge-now.sh", "verify-panel-ports.sh",
    "has-valid-next-build.sh", "load-env.cjs", "panel-port-config.sh",
    "set-admin-password.cjs", "verify-install-smoke.sh", "verify-install-login.sh",
    "verify-panel-admin-login.cjs", "reset-panel-admin.sh"
)
foreach ($f in $scriptCopies) {
    Copy-Item -Force "$scripts\$f" "$install\scripts\$f"
}
Copy-Item -Force "$scripts\fix-panel-ip-login.sh" "$install\scripts\fix-ip-login.sh"
Copy-Item -Force "$scripts\fix-panel-ip-login.sh" "$install\fix-ip-login.sh" -ErrorAction SilentlyContinue

Write-Host "-> Generate VPS deploy bundle"
$bash = $null
foreach ($candidate in @(
    "C:\Program Files\Git\bin\bash.exe",
    "C:\Program Files (x86)\Git\bin\bash.exe"
)) {
    if (Test-Path $candidate) { $bash = $candidate; break }
}
if (-not $bash) {
    Write-Host "ERROR: Git Bash not found. Install Git for Windows: https://git-scm.com/download/win" -ForegroundColor Red
    exit 1
}
& $bash "$Root\marketing-drop-in\scripts\generate-vps-bundle.sh"

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Upload via WinSCP:"
Write-Host "  FROM: $Root\marketing-drop-in\scripts\vps-full-update.sh"
Write-Host "  TO:   /root/vps-full-update.sh"
Write-Host ""
Write-Host "Then on VPS:"
Write-Host "  bash /root/vps-full-update.sh"
Write-Host "  bash /root/nexlify-full-platform-audit.sh"
