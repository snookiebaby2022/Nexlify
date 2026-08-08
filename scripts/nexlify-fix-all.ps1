# One command: git pull + sync + generate VPS bundle (Windows).
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

Write-Host "-> Sync" -ForegroundColor Cyan
& "$Root\scripts\nexlify-sync-all.ps1"

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

Write-Host ""
Write-Host "=== FIX-ALL COMPLETE ===" -ForegroundColor Green
Write-Host ""
Write-Host "OPTION A - VPS self-deploy (no WinSCP):"
Write-Host "  ssh root@YOUR_VPS ""cd /home/nexlify-panel && git fetch origin main && git reset --hard origin/main && bash scripts/nexlify-fix-all.sh"""
Write-Host ""
Write-Host "OPTION B - Upload bundle via WinSCP:"
Write-Host "  FROM: $Root\marketing-drop-in\scripts\vps-full-update.sh"
Write-Host "  TO:   /root/vps-full-update.sh"
Write-Host "  Then: bash /root/vps-full-update.sh"
