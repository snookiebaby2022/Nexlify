# One command: git pull + sync + WinSCP panel sync + generate VPS bundle (Windows).
# Run: cd C:\Users\lizzi\nexlify-panel; .\scripts\nexlify-fix-all.ps1

$ErrorActionPreference = "Stop"

function Find-NexlifyRoot([string]$Start) {
    $dir = (Resolve-Path $Start).Path
    while ($dir) {
        if ((Test-Path "$dir\package.json") -and (Test-Path "$dir\marketing-drop-in")) { return $dir }
        $parent = Split-Path $dir -Parent
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Nexlify repo not found. cd to C:\Users\lizzi\nexlify-panel first."
}

$Root = Find-NexlifyRoot $(if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path })
Set-Location $Root
Write-Host "=== Nexlify fix-all (Windows) ===" -ForegroundColor Cyan
Write-Host "Repo: $Root" -ForegroundColor DarkGray

Write-Host "-> Git pull" -ForegroundColor Cyan
Remove-Item -Force "$Root\marketing-drop-in\scripts\vps-full-update.sh" -ErrorAction SilentlyContinue
git fetch origin main
git reset --hard origin/main

Write-Host "-> Sync + generate bundle" -ForegroundColor Cyan
& "$Root\scripts\nexlify-sync-all.ps1"

Write-Host "-> WinSCP sync panel to VPS" -ForegroundColor Cyan
$deployConfig = Join-Path $Root "windows\deploy.config.json"
if (Test-Path $deployConfig) {
    & (Join-Path $Root "windows\scripts\sync-to-vps.ps1")
} else {
    Write-Host "  SKIP: windows\deploy.config.json not found" -ForegroundColor Yellow
    Write-Host "  Copy windows\deploy.config.example.json -> deploy.config.json and configure WinSCP"
}

Write-Host "-> Verify" -ForegroundColor Cyan
$bash = $null
foreach ($c in @("C:\Program Files\Git\bin\bash.exe", "C:\Program Files (x86)\Git\bin\bash.exe")) {
    if (Test-Path $c) { $bash = $c; break }
}
if ($bash) {
    & $bash "$Root\scripts\nexlify-verify-sync.sh"
} else {
    Write-Host "  (skip verify - Git Bash not found)" -ForegroundColor Yellow
}

$bundle = "$Root\marketing-drop-in\scripts\vps-full-update.sh"
Write-Host ""
Write-Host "=== FIX-ALL COMPLETE (PC side) ===" -ForegroundColor Green
Write-Host ""
if (-not (Test-Path $deployConfig)) {
    Write-Host "Manual WinSCP uploads needed:"
    Write-Host "  1. Panel scripts: sync whole repo (exclude node_modules) -> /home/nexlify-panel"
    Write-Host "  2. Bundle: $bundle -> /root/vps-full-update.sh"
} else {
    Write-Host "Upload bundle via WinSCP (panel scripts synced above if sync succeeded):"
    Write-Host "  FROM: $bundle"
    Write-Host "  TO:   /root/vps-full-update.sh"
}
Write-Host ""
Write-Host "Then on VPS run:"
Write-Host "  bash /home/nexlify-panel/scripts/nexlify-vps-fix-no-git.sh"
