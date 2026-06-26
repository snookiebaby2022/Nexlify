# Upload Nexlify to VPS and run install
# Usage: .\deploy\publish.ps1
# Optional: .\deploy\publish.ps1 -Host 85.17.162.54 -User root

param(
  [string]$VpsHost = "85.17.162.54",
  [string]$User = "root",
  [string]$RemotePath = "/var/www/nexlify"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$Archive = Join-Path $env:TEMP "nexlify-deploy.tar.gz"

Write-Host "Packaging project from $ProjectRoot ..."
Push-Location $ProjectRoot
tar -czf $Archive `
  --exclude=node_modules `
  --exclude=.next `
  --exclude=.git `
  --exclude=dev.db `
  --exclude=data `
  --exclude=.env `
  .
Pop-Location

Write-Host "Testing SSH to ${User}@${VpsHost} (requires key-based auth)..."
ssh -o BatchMode=yes -o ConnectTimeout=15 "${User}@${VpsHost}" "echo connected"
if ($LASTEXITCODE -ne 0) {
  Write-Error @"
SSH failed. Set up key login first:
  ssh-keygen -t ed25519 -N '""' -f `$env:USERPROFILE\.ssh\id_ed25519
  type `$env:USERPROFILE\.ssh\id_ed25519.pub | ssh ${User}@${VpsHost} `"mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys`"
Then re-run: npm run deploy:vps
"@
}

Write-Host "Uploading to ${User}@${VpsHost}:${RemotePath} ..."
ssh -o BatchMode=yes "${User}@${VpsHost}" "mkdir -p $RemotePath"
scp $Archive "${User}@${VpsHost}:/tmp/nexlify-deploy.tar.gz"
ssh "${User}@${VpsHost}" @"
set -e
mkdir -p $RemotePath
tar -xzf /tmp/nexlify-deploy.tar.gz -C $RemotePath
chmod +x $RemotePath/deploy/*.sh
bash $RemotePath/deploy/remote-install.sh
"@

Remove-Item $Archive -Force -ErrorAction SilentlyContinue
Write-Host "Done. Open http://${VpsHost} (or https://nexlify.live when DNS + SSL ready)"
