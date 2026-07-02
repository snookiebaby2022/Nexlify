# Creates ../nexlify-panel-upload.zip (excludes node_modules, .next, .env)
$root = Split-Path -Parent $PSScriptRoot
$zip = Join-Path (Split-Path -Parent $root) "nexlify-panel-upload.zip"
$staging = Join-Path $env:TEMP "nexlify-pack"
$target = Join-Path $staging "nexlify-panel"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $target -Force | Out-Null

robocopy $root $target /E /XD node_modules .next .git /XF .env .env.local /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit $LASTEXITCODE" }

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $target -DestinationPath $zip -Force
Remove-Item $staging -Recurse -Force

Write-Host "Created: $zip"
Write-Host "On VPS: unzip, cd nexlify-panel, run: chmod +x scripts/deploy-vps.sh && ./scripts/deploy-vps.sh"
