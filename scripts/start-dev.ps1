$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

function Find-Npm {
  if (Get-Command npm -ErrorAction SilentlyContinue) { return "npm" }
  $candidates = @(
    "$env:ProgramFiles\nodejs\npm.cmd",
    "${env:ProgramFiles(x86)}\nodejs\npm.cmd",
    "$env:LOCALAPPDATA\fnm_multishells\*\npm.cmd"
  )
  foreach ($c in $candidates) {
    $hit = Get-Item $c -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  throw "npm not found. Install Node.js 20 LTS from https://nodejs.org and reopen the terminal."
}

$npm = Find-Npm

if (-not (Test-Path "node_modules")) {
  Write-Host "==> Installing dependencies..."
  & $npm install
}

Write-Host "==> Starting Nexlify at http://localhost:3000"
& $npm run dev
