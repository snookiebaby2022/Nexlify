# Installs a post-commit hook that runs deploy:update (optional local auto-deploy)
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$HookPath = Join-Path $ProjectRoot ".git\hooks\post-commit"

if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
  Write-Error "Not a git repository. Run git init first."
}

$hookContent = @'
#!/bin/sh
# Auto-deploy Nexlify to VPS after each commit (Windows: uses PowerShell)
cd "$(git rev-parse --show-toplevel)"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy/windows-to-vps.ps1 -UpdateOnly
'@

Set-Content -Path $HookPath -Value $hookContent -Encoding UTF8
Write-Host "Installed: $HookPath"
Write-Host "Each git commit will run: npm run deploy:update"
Write-Host "Remove the file to disable auto-deploy."
