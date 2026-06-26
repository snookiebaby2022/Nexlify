# Creates upload zip for VPS file manager (no SSH needed)
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Archive = Join-Path $env:TEMP "nexlify-deploy.tar.gz"

Push-Location $ProjectRoot
tar -czf $Archive `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=.git `
  --exclude=dev.db `
  --exclude=data `
  --exclude=.env `
  --exclude=nexlify-panel `
  --exclude=whmcs `
  .
Pop-Location

Write-Host "Created: $Archive"
Write-Host "Upload this file to your VPS as: /tmp/nexlify-deploy.tar.gz"
Write-Host "Then in WEB CONSOLE run:"
Write-Host "  bash /var/www/nexlify/deploy/console-bootstrap.sh"
Write-Host "(after extracting once, or run commands from deploy/CONSOLE-INSTALL.md)"
